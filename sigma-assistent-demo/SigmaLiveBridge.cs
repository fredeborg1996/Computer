// Read-only COM bridge. Static interface evidence: Sigma 8.3.2.13127 embedded typelib.
// No vendor code is loaded by compilation; actual COM field mapping requires laptop validation.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

class SigmaLiveBridge {
  [DllImport("oleaut32.dll", PreserveSig=false)]
  static extern void GetActiveObject(ref Guid clsid,IntPtr reserved,[MarshalAs(UnmanagedType.IUnknown)] out object instance);
  static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
  static readonly string Data = Path.Combine(Root,"data");
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1500000 };
  static readonly List<Dictionary<string,object>> Rows = new List<Dictionary<string,object>>();
  static readonly Dictionary<object,string> ProjectIds = new Dictionary<object,string>();
  static object Read(object obj,string name,params object[] args) {
    return obj.GetType().InvokeMember(name,BindingFlags.GetProperty,null,obj,args,CultureInfo.InvariantCulture);
  }
  static Dictionary<string,object> Fields(object item) {
    var result=new Dictionary<string,object>(StringComparer.OrdinalIgnoreCase);
    object values=Read(item,"Values");
    int count=Convert.ToInt32(Read(values,"Count"));
    if(count>500)throw new Exception("Too many Sigma fields.");
    for(int i=0;i<count;i++) {
      object value=Read(values,"Values",i);
      result[Convert.ToString(Read(value,"Name"))]=Read(value,"Value");
    }
    return result;
  }
  static object Field(Dictionary<string,object> fields,params string[] names) {
    foreach(string name in names) if(fields.ContainsKey(name))return fields[name];
    throw new Exception("Sigma field missing: "+String.Join("/",names)+". Available names: "+String.Join(",",fields.Keys));
  }
  static double Number(Dictionary<string,object> f,params string[] names) {
    object value=Field(f,names);
    if(value==null || value==DBNull.Value)throw new Exception("Empty Sigma number: "+names[0]);
    double number=Convert.ToDouble(value,CultureInfo.InvariantCulture);
    if(Double.IsNaN(number)||Double.IsInfinity(number)||number<0)throw new Exception("Invalid Sigma number: "+names[0]);
    return number;
  }
  static void Visit(object item,string parent,string id,int depth) {
    if(depth>50||Rows.Count>=1000)throw new Exception("Sigma hierarchy exceeds limits.");
    if(!Convert.ToBoolean(Read(item,"Enabled")))throw new Exception("Disabled Sigma item requires field reconciliation.");
    var f=Fields(item);
    Rows.Add(new Dictionary<string,object> {
      {"id",id},{"parentId",parent},{"text",Convert.ToString(Field(f,"Name","Text","tcText"))},
      {"unit",Convert.ToString(Field(f,"Unit","Units","tcUnits"))},
      {"quantity",Number(f,"Amount","Quantity","tcQuantity")},
      {"unitSalesPrice",Number(f,"UnitSalesPrice","tcUnitSalesPrice")},
      {"salesPrice",Number(f,"SalesPrice","tcSalesPrice")},{"costPrice",Number(f,"CostPrice","tcCostPrice")}
    });
    Children(item,id,id,depth+1);
  }
  static void Children(object item,string parent,string prefix,int depth) {
    object children=Read(item,"Items");int count=Convert.ToInt32(Read(children,"Count"));
    for(int i=0;i<count;i++)Visit(Read(children,"Items",i),parent,prefix==""?(i+1).ToString():prefix+"."+(i+1),depth);
  }
  static string Snapshot() {
    // GetActiveObject attaches only to an already running Sigma. Never creates a project or application.
    Guid clsid=new Guid("bdf54b65-3a51-4261-968a-a95496d60ce7");
    object app; GetActiveObject(ref clsid,IntPtr.Zero,out app);
    object project=Read(app,"ActiveProject");
    if(project==null)throw new Exception("Open a COPY of a project in Sigma first.");
    return SnapshotProject(project);
  }
  static string SnapshotProject(object project) {
    object root=Read(project,"RootItem");Rows.Clear();Children(root,null,"",0);
    string filename=Convert.ToString(Read(project,"Filename"));
    if(!ProjectIds.ContainsKey(project))ProjectIds[project]="com:"+Guid.NewGuid().ToString("N");
    return Json.Serialize(new Dictionary<string,object> {
      {"version",2},{"projectId",ProjectIds[project]},
      {"projectFile",String.IsNullOrWhiteSpace(filename)?"":Path.GetFullPath(filename)},
      {"name",Convert.ToString(Read(project,"Name"))},{"items",Rows},
      {"salesTotal",Number(Fields(root),"SalesPrice","tcSalesPrice")},{"sourceKind","com"}
    });
  }
  // Contract tests exercise our actual serializer/project-identity code with in-memory
  // fixtures. They do not establish that Sigma's COM marshalling/field names work.
  public class FixtureValue {public string Name{get;set;} public object Value{get;set;}}
  public class FixtureValues {
    public List<FixtureValue> Data=new List<FixtureValue>();
    public int Count{get{return Data.Count;}}
    [System.Runtime.CompilerServices.IndexerName("Values")]
    public FixtureValue this[int i]{get{return Data[i];}}
  }
  public class FixtureItems {
    public List<FixtureItem> Data=new List<FixtureItem>();
    public int Count{get{return Data.Count;}}
    [System.Runtime.CompilerServices.IndexerName("Items")]
    public FixtureItem this[int i]{get{return Data[i];}}
  }
  public class FixtureItem {
    public bool Enabled{get{return true;}}
    public FixtureValues Values{get;set;}
    public FixtureItems Items{get;set;}
    public FixtureItem(){Values=new FixtureValues();Items=new FixtureItems();}
  }
  public class FixtureProject {public string Filename{get;set;} public string Name{get;set;} public FixtureItem RootItem{get;set;}}
  static FixtureItem FixtureRow(double total) {
    var item=new FixtureItem();
    foreach(var pair in new Dictionary<string,object>{{"Name","Udgravning regnvandsledning"},{"Unit","m"},{"Quantity",1.0},{"UnitSalesPrice",total},{"SalesPrice",total},{"CostPrice",total}})
      item.Values.Data.Add(new FixtureValue{Name=pair.Key,Value=pair.Value});
    return item;
  }
  static Dictionary<string,object> Parsed(FixtureProject project){return (Dictionary<string,object>)Json.DeserializeObject(SnapshotProject(project));}
  static int SelfTest() {
    var first=new FixtureProject{Name="Ny kalkulation",Filename="",RootItem=FixtureRow(0)};
    var second=new FixtureProject{Name="Ny kalkulation",Filename="",RootItem=FixtureRow(0)};
    var blank=Parsed(first);string id=(string)blank["projectId"];
    if(((object[])blank["items"]).Length!=0)throw new Exception("Empty project fixture failed.");
    first.RootItem.Items.Data.Add(FixtureRow(75960));first.RootItem.Values.Data.Find(v=>v.Name=="SalesPrice").Value=75960;
    var populated=Parsed(first);
    if((string)populated["projectId"]!=id || ((object[])populated["items"]).Length!=1)throw new Exception("Unsaved update fixture failed.");
    if((string)Parsed(second)["projectId"]==id)throw new Exception("New project identity collided.");
    first.Name="Renamed";first.Filename=Path.Combine(Root,"fixture.sig");
    if((string)Parsed(first)["projectId"]!=id)throw new Exception("Saving/renaming changed project identity.");
    Console.WriteLine("PASS: blank unsaved project, first item, same-title new project, return to project, save/rename identity. In-memory contract test; vendor COM not tested.");
    Rows.Clear();ProjectIds.Clear();return 0;
  }
  static void Send(string payload) {
    string token=File.ReadAllText(Path.Combine(Data,"bridge-token.txt")).Trim();
    var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:4317/api/sigma/snapshot");
    request.Method="POST";request.ContentType="application/json";request.Headers["Authorization"]="Bearer "+token;
    request.Timeout=1500;request.ReadWriteTimeout=1500;request.Proxy=null;
    byte[] bytes=Encoding.UTF8.GetBytes(payload);request.ContentLength=bytes.Length;
    using(Stream stream=request.GetRequestStream())stream.Write(bytes,0,bytes.Length);
    using(var response=(HttpWebResponse)request.GetResponse()) {
      if(response.StatusCode!=HttpStatusCode.OK)throw new Exception("Sigma snapshot rejected.");
    }
  }
  static void Status(string status,string message) {
    Directory.CreateDirectory(Data);
    File.WriteAllText(Path.Combine(Data,"sigma-live-status.json"),Json.Serialize(new { status=status,message=message,time=DateTime.UtcNow.ToString("o"),runtimeValidated=false }));
  }
  [STAThread] static int Main(string[] args) {
    if(Array.IndexOf(args,"--self-test")>=0)return SelfTest();
    bool created;using(var mutex=new Mutex(true,"Local\\MAKSigmaLiveBridge",out created)) {
      if(!created)return 0;
      bool once=Array.IndexOf(args,"--once")>=0;string previous="";
      do {
        try { string payload=Snapshot();if(payload!=previous){Send(payload);previous=payload;}Status("connected","Read-only COM snapshot sent; field reconciliation still required."); }
        catch(Exception e) { Status("waiting",e.GetBaseException().Message);Console.Error.WriteLine(e.GetBaseException().Message);if(once)return 2; }
        finally { Rows.Clear();GC.Collect();GC.WaitForPendingFinalizers(); }
        if(once)return 0;Thread.Sleep(2000);
      } while(true);
    }
  }
}
