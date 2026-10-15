// Prototype til EG Sigma AppScript. IKKE kompileret/afprøvet i Sigma endnu.
// Kør først på en KOPI af en kalkulation. Læs README om feltafstemning.
// Indsæt bridge-token fra data/bridge-token.txt på SAMME computer.
unit MAKCompanion;
interface
uses Sigma.Document, System.Timers, System.Net.HTTP.Client;
type
  TMAKCompanion = class
  public
    Timer: TTimer;
    PreviousPayload: String;
    procedure Tick(Sender: TTimer);
  end;
implementation
procedure TMAKCompanion.Tick(Sender: TTimer);
begin
  if Application.ActiveProject = nil then exit;
  var Content := JSON.NewObject;
  Content.name := Application.ActiveProject.Name;
  Content.items := JSON.NewArray;
  var Root := Application.ActiveProject.RootItem;
  // Topniveau alene: ingen dobbeltoptælling af børn og forældre.
  // tcUnitSalesPrice er salgspris/enhed, tcQuantity er mængde.
  // Version, afrunding og tillæg skal afstemmes mod Sigma før driftsbrug.
  for var i := 0 to Root.Items.Count - 1 do
  begin
    var Item := Root.Items[i];
    var Row := JSON.NewObject;
    Row.id := IntToStr(i + 1);
    Row.text := Item.Values[tcText];
    Row.qty := Item.Values[tcQuantity];
    Row.unit := Item.Values[tcUnits];
    Row.price := Item.Values[tcUnitSalesPrice];
    Content.items[i] := Row;
  end;
  var Payload := JSONBeautify(Content);
  if Payload = PreviousPayload then exit;
  // Kun lokal HTTP-overførsel. Kort timeout; ingen modelkørsel i Sigma.
  var Client := TWebClient.Create;
  try
    Client.ConnectionTimeOut := 300;
    Client.ReceiveTimeout := 500;
    Client.SendTimeout := 500;
    var Response := Client.Post('http://127.0.0.1:4317/api/sigma/snapshot',
      Payload, 'application/json', 'Authorization: Bearer INDSAET_LOKALT_BRIDGE_TOKEN');
    if Response.Success then PreviousPayload := Payload;
  finally
    Client.Free;
  end;
end;
initialization
  var Companion := TMAKCompanion.Create;
  Companion.Timer := TTimer.Create(nil);
  Companion.Timer.Interval := 2000;
  Companion.Timer.OnTimer := Companion.Tick;
  Companion.Timer.Enabled := True;
finalization
  Companion.Timer.Enabled := False;
  Companion.Timer.Free;
  Companion.Free;
