// Forrige panelversion er brugerkompileret og synlig i Sigma.
// Denne rettelse bevarer gemt modelvalg; genbyg bundle og afprøv genstart i Sigma.
// Native Sigma controls beside the grid; only our server helper starts hidden on first opening.
// Read-only snapshots; model calls and sum validation remain in the local server.
unit SigmaNativeAI;
interface
uses Sigma.Document, System.UI.Automation, System.UI.Controls, System.UI.Ribbon,
  System.UI.Dialogs, System.Timers, System.Classes, System.Net.HTTP.Client, System.Encoding, COM;
type
  TNativeAI = class
  public
    MenuGroup: TRibbonTabGroup;
    Timer: TTimer;
    Busy: Boolean;
    HasPanels: Boolean;
    TextCache: TStringList;
    TextVersion: Integer;
    ServerStarted: Boolean;
    ControlUpdateDepth: Integer;
    InstanceId: String;
    function ActiveHost: TContainerControl;
    function ActivePanel: TPanel;
    function Child(Panel: TPanel; Key: String): TControl;
    function Request(Path: String; Payload: String): String;
    function ProjectKey: String;
    procedure AddRows(Item: TSigmaItem; ParentId: String; Prefix: String; Depth: Integer; Rows: JSONVariant);
    procedure Snapshot(Panel: TPanel);
    procedure RefreshPanel(Panel: TPanel);
    procedure SetStatus(Panel: TPanel; Text: String);
    procedure CreatePanel(Host: TContainerControl);
    procedure TogglePanel(Sender: TRibbonItem);
    procedure HidePanel(Sender: TControl);
    procedure SendQuestion(Sender: TControl);
    procedure ResizePanel(Panel: TPanel; NewWidth: Integer);
    procedure ToggleWidth(Sender: TControl);
    procedure DraftKeypress(Sender: TControl; var Key: String);
    procedure SaveModel(Sender: TControl);
    procedure RefreshAccount(Panel: TPanel);
    procedure ApplyOpenAICatalogue(Panel: TPanel; Models: JSONVariant; Preferred: String);
    procedure LoginAccount(Sender: TControl);
    procedure LogoutAccount(Sender: TControl);
    procedure ConnectionChanged(Sender: TControl);
    procedure ModelChanged(Sender: TControl);
    procedure ToggleSettings(Sender: TControl);
    procedure ToggleMaterials(Sender: TControl);
    procedure ShowPage(Panel: TPanel; Page: String);
    function SafeError(Text: String): String;
    procedure UpdateMemo(Memo: TMemo; Text: String);
    procedure StoreText(Panel: TPanel; Key: String; Text: String);
    function ReadText(Panel: TPanel; Key: String): String;
    procedure RenderPaged(Panel: TPanel; Key: String);
    procedure PageEarlier(Sender: TControl);
    procedure PageNext(Sender: TControl);
    procedure PageLatest(Sender: TControl);
    function ModelMatches(Panel: TPanel): Boolean;
    procedure UpdateSummary(Panel: TPanel);
    procedure Tick(Sender: TTimer);
    procedure RefreshNow(Sender: TControl);
    procedure StartServer;
    function CheckReply(Reply: String; Success: Boolean): String;
    function RenderStamp(Panel: TPanel; Key: String; Memo: TMemo): String;
    procedure Install;
    procedure DetachPanels;
  end;
implementation
const LegacyPanelTag = 1296124745;
const PanelTag = 1296124746;
const BaseUrl = 'http://127.0.0.1:4317';
const TokenFile = 'C:\MAK-Sigma\data\bridge-token.txt';

function TNativeAI.ActiveHost: TContainerControl;
begin
  Result := nil;
  var Project := Application.ActiveProject;
  if Project = nil then exit;
  for var i := 0 to Project.Pages.Count - 1 do
    if Project.Pages[i].Active then
    begin
      var Reader := GetGridReader(Project.Pages[i].GetUserInterfaceAutomation);
      if Reader <> nil then
      begin
        var Control := Reader.Control;
        if Control is TControl then Result := (Control as TControl).Parent;
      end;
      if Result <> nil then exit;
    end;
end;

function TNativeAI.ActivePanel: TPanel;
begin
  Result := nil;
  var Host := ActiveHost;
  if Host = nil then exit;
  for var i := 0 to Host.Controls.Count - 1 do
  begin
    var Candidate := Host.Controls.Items[i];
    if (Candidate.Tag = PanelTag) and (Candidate is TPanel) then
    begin
      var Meta := Child(Candidate as TPanel, 'Meta') as TEdit;
      if Meta <> nil then
      begin
        var State := JSON.Parse(Meta.Text);
        if State.instanceId = InstanceId then
        begin
          Result := Candidate as TPanel;
          exit;
        end;
      end;
    end;
  end;
end;

function TNativeAI.Child(Panel: TPanel; Key: String): TControl;
begin
  // AppScript exposes TComponent.Name as read-only. Use writable Tag values
  // on components owned by this panel, regardless of their visual parent.
  var Id := 0;
  case Key of
    'Meta': Id := 1;
    'Status': Id := 2;
    'Connection': Id := 3;
    'Model': Id := 5;
    'Save': Id := 6;
    'Draft': Id := 9;
    'Send': Id := 10;
    'Hide': Id := 12;
    'Transcript': Id := 13;
    'Login': Id := 14;
    'Logout': Id := 15;
    'AccountStatus': Id := 16;
    'Header': Id := 17;
    'Settings': Id := 18;
    'MaterialPanel': Id := 19;
    'MaterialText': Id := 20;
    'SettingsToggle': Id := 21;
    'MaterialToggle': Id := 22;
    'Summary': Id := 23;
    'Composer': Id := 24;
    'SharingNotice': Id := 25;
    'ChatPage': Id := 26;
    'TranscriptEarlier': Id := 27;
    'TranscriptNext': Id := 28;
    'TranscriptLatest': Id := 29;
    'TranscriptPage': Id := 30;
    'MaterialEarlier': Id := 31;
    'MaterialNext': Id := 32;
    'MaterialLatest': Id := 33;
    'MaterialPage': Id := 34;
    'Refresh': Id := 35;
    'CaseTitle': Id := 36;
  end;
  if Id = 0 then raise Exception.Create('Ukendt panelkontrol: ' + Key);
  for var i := 0 to Panel.ComponentCount - 1 do
  begin
    var Component := Panel.Components[i];
    if (Component.Tag = Id) and (Component is TControl) then
    begin
      Result := Component as TControl;
      exit;
    end;
  end;
  raise Exception.Create('Panelkontrol mangler: ' + Key);
end;

procedure TNativeAI.SetStatus(Panel: TPanel; Text: String);
begin
  Child(Panel, 'Status').Caption := Text;
  Child(Panel, 'Status').Hint := Text; Child(Panel, 'Status').ShowHint := True;
end;

function TNativeAI.Request(Path: String; Payload: String): String;
begin
  Result := '';
  var Secret := TStringList.Create;
  // WebClient is Sigma's initialized shared HTTP client. TWebClient has no
  // public constructor: creating an inherited TObject wrapper is invalid.
  var Client := WebClient;
  var OldConnectionTimeout := Client.ConnectionTimeOut;
  var OldReceiveTimeout := Client.ReceiveTimeout;
  var OldSendTimeout := Client.SendTimeout;
  try
    // Local file only. Never place this bearer token in logs, captions or source.
    Secret.LoadFromFile(TokenFile);
    var Header := 'Authorization: Bearer ' + Trim(Secret.Text);
    Client.ConnectionTimeOut := 500;
    Client.ReceiveTimeout := 700;
    Client.SendTimeout := 700;
    if Payload = '' then
    begin
      var Response := Client.Get(BaseUrl + Path, Header);
      Result := CheckReply(Response.ContentAsText, Response.Success);
    end else
    begin
      var Response := Client.Post(BaseUrl + Path, Payload, 'application/json', Header);
      // Error responses contain server-generated, user-readable validation errors.
      Result := CheckReply(Response.ContentAsText, Response.Success);
    end;
  finally
    Secret.Text := '';
    Secret.Free;
    // Borrowed singleton: restore our short request limits; never Free it.
    Client.ConnectionTimeOut := OldConnectionTimeout;
    Client.ReceiveTimeout := OldReceiveTimeout;
    Client.SendTimeout := OldSendTimeout;
  end;
end;

function TNativeAI.ProjectKey: String;
begin
  Result := '';
  var Project := Application.ActiveProject;
  if Project = nil then exit;
  // Fresh wrappers only. Identity is held by project-owned controls, not a
  // retained TSigmaProject wrapper or a title that could collide.
  for var p := 0 to Project.Pages.Count - 1 do
  begin
    var Reader := GetGridReader(Project.Pages[p].GetUserInterfaceAutomation);
    if Reader <> nil then
    begin
      var Grid := Reader.Control;
      if Grid is TControl then
      begin
        var Host := (Grid as TControl).Parent;
        if Host <> nil then
          for var n := 0 to Host.Controls.Count - 1 do
          begin
            var Candidate := Host.Controls.Items[n];
            if (Candidate.Tag = PanelTag) and (Candidate is TPanel) then
            begin
              var Meta := Child(Candidate as TPanel, 'Meta') as TEdit;
              if Meta <> nil then
              begin
                var State := JSON.Parse(Meta.Text);
                Result := State.projectId;
                exit;
              end;
            end;
          end;
      end;
    end;
  end;
  Result := 'appscript:' + CreateGUID;
end;

procedure TNativeAI.AddRows(Item: TSigmaItem; ParentId: String; Prefix: String; Depth: Integer; Rows: JSONVariant);
begin
  if Depth > 50 then raise Exception.Create('Kalkulationens hierarki overstiger 50 niveauer.');
  for var i := 0 to Item.Items.Count - 1 do
  begin
    if Rows.length >= 1000 then raise Exception.Create('Kalkulationen overstiger 1000 linjer. Ingen delvis overførsel.');
    var Entry := Item.Items[i];
    if not Entry.Enabled then raise Exception.Create('Deaktiverede linjer kræver feltafstemning før overførsel.');
    var Id := IntToStr(i + 1);
    if Prefix <> '' then Id := Prefix + '.' + Id;
    var Row := JSON.NewObject;
    Row.id := Id;
    if ParentId = '' then Row.parentId := nil else Row.parentId := ParentId;
    Row.text := Entry.Values[tcText];
    Row.unit := Entry.Values[tcUnits];
    Row.quantity := Entry.Values[tcQuantity];
    Row.unitSalesPrice := Entry.Values[tcUnitSalesPrice];
    Row.salesPrice := Entry.Values[tcSalesPrice];
    Row.costPrice := Entry.Values[tcCostPrice];
    Row.enabled := Entry.Enabled;
    Rows[Rows.length] := Row;
    AddRows(Entry, Id, Id, Depth + 1, Rows);
  end;
end;

procedure TNativeAI.Snapshot(Panel: TPanel);
begin
  var Project := Application.ActiveProject;
  if Project = nil then exit;
  var Meta := Child(Panel, 'Meta') as TEdit;
  var State := JSON.Parse(Meta.Text);
  var Content := JSON.NewObject;
  Content.version := 2;
  Content.projectId := State.projectId;
  Content.projectFile := Project.Filename;
  Content.name := Project.Name;
  Content.sourceKind := 'appscript';
  Content.items := JSON.NewArray;
  AddRows(Project.RootItem, '', '', 0, Content.items);
  Content.salesTotal := Project.RootItem.Values[tcSalesPrice];
  var Payload := JSONBeautify(Content);
  var Reply := Request('/api/sigma/snapshot', Payload);
  if Reply = '' then raise Exception.Create('Serveren svarer ikke.');
  var Data := JSON.Parse(Reply);
  if not VarIsEmpty(Data.error) and not VarIsNull(Data.error) and (Data.error <> '') then
  begin
    raise Exception.Create(Data.error);
  end;
  State.projectId := Data.projectId;
  State.revision := Data.revision;
  Meta.Text := JSONBeautify(State);
end;

procedure TNativeAI.RefreshPanel(Panel: TPanel);
begin
  var Meta := Child(Panel, 'Meta') as TEdit;
  var State := JSON.Parse(Meta.Text);
  if State.resultNeedsRefresh then
  begin
    SetStatus(Panel, 'Svaret afventer kontrol af den aktuelle sag. Klik Opdater.');
    Child(Panel, 'Send').Enabled := False; exit;
  end;
  var Reply := Request('/api/native/view?projectId=' + URLEncodedEncoder.Encode(State.projectId), '');
  if Reply = '' then
  begin
    SetStatus(Panel, 'Lokal server svarer ikke. Start serveren, og kontrollér forbindelsen.');
    Child(Panel, 'Send').Enabled := False;
    exit;
  end;
  var View := JSON.Parse(Reply);
  if not VarIsEmpty(View.error) and not VarIsNull(View.error) and (View.error <> '') then
  begin
    SetStatus(Panel, View.error);
    Child(Panel, 'Send').Enabled := False;
    exit;
  end;
  State.revision := View.revision;
  ResizePanel(Panel, View.panel.width);
  Child(Panel, 'CaseTitle').Caption := 'Sigma AI ? ' + Copy(View.caseName, 1, 12);
  Child(Panel, 'CaseTitle').Font.Size := 11;
  Child(Panel, 'Header').Hint := 'Aktiv kalkulation: ' + View.caseName;
  Child(Panel, 'Header').ShowHint := True;
  var Transcript := Child(Panel, 'Transcript') as TMemo;
  var NewText := View.transcript;
  if State.staleAnswer then NewText := 'KALKULATIONEN ER ÆNDRET. Tidligere svar gælder den tidligere version. Send spørgsmålet igen.' + #13#10#13#10 + NewText;
  if NewText = '' then NewText := 'Hvad vil du vide om den aktive kalkulation?';
  var MaterialText := 'KALKULATIONSLINJER FRA DEN AKTIVE SAG';
  for var i := 0 to View.items.length - 1 do
    MaterialText := MaterialText + #13#10 + View.items[i].text;
  MaterialText := MaterialText + #13#10#13#10 + 'BILAG';
  for var d := 0 to View.documents.length - 1 do
    MaterialText := MaterialText + #13#10 + View.documents[d].name;
  MaterialText := MaterialText + #13#10#13#10 + View.sourcesText;
  StoreText(Panel, 'materialBody', MaterialText);
  if (Child(Panel, 'Connection') as TComboBox).ItemIndex = 1 then
    MaterialText := State.accountText + #13#10#13#10 + MaterialText;
  StoreText(Panel, 'material', MaterialText);
  var JobWorking := False;
  if not VarIsEmpty(View.job) and not VarIsNull(View.job) then
    JobWorking := (View.job.status = 'working') or (View.job.status = 'queued');
  if State.jobId <> '' then
  begin
    var JobReply := '';
    try
      JobReply := Request('/api/native/jobs/' + URLEncodedEncoder.Encode(State.jobId) + '?projectId=' + URLEncodedEncoder.Encode(State.projectId), '');
    except
      State.jobId := ''; Meta.Text := JSONBeautify(State);
      raise;
    end;
    if JobReply <> '' then
    begin
      var Job := JSON.Parse(JobReply);
      if not VarIsEmpty(Job.error) and not VarIsNull(Job.error) and (Job.error <> '') then
        NewText := NewText + #13#10 + 'Model/jobfejl: ' + Job.error;
      JobWorking := (Job.status = 'working') or (Job.status = 'queued');
      if JobWorking then NewText := NewText + #13#10 + 'Assistenten arbejder...';
      if (Job.status = 'done') or (Job.status = 'error') then
      begin
        // One read on completion protects against edits made during inference.
        // No calculation traversal occurs while the job is still working.
        var CompletedRevision := State.revision;
        State.jobId := ''; State.resultNeedsRefresh := True; Meta.Text := JSONBeautify(State);
        Snapshot(Panel);
        State := JSON.Parse(Meta.Text); State.resultNeedsRefresh := False; Meta.Text := JSONBeautify(State);
        if State.revision <> CompletedRevision then
        begin
          State.staleAnswer := True; Meta.Text := JSONBeautify(State);
          Child(Panel, 'Send').Enabled := False;
          SetStatus(Panel, 'Kalkulationen er ændret. Send spørgsmålet igen for den aktuelle sag.');
          StoreText(Panel, 'transcript', 'Kalkulationen blev ændret under svaret. Send spørgsmålet igen; det tidligere svar vises ikke.');
          RenderPaged(Panel, 'transcript');
          exit;
        end;
      end;

    end;
  end;
  StoreText(Panel, 'transcript', NewText);
  var SavedChoice := 0;
  if View.modelSettings.mode = 'cloud' then
    if View.modelSettings.provider = 'anthropic' then SavedChoice := 2 else SavedChoice := 1;
  State.savedChoice := SavedChoice;
  State.savedModel := View.modelSettings.model;
  State.savedAuth := '';
  if not VarIsEmpty(View.modelSettings.auth) and not VarIsNull(View.modelSettings.auth) then
    State.savedAuth := View.modelSettings.auth;
  if not State.modelLoaded and not State.dirty then
  begin
    var SavedName := View.modelSettings.model;
    State.uiChoice := SavedChoice;
    if SavedChoice = 0 then State.localModel := SavedName;
    if SavedChoice = 1 then State.openaiModel := SavedName;
    if SavedChoice = 2 then State.anthropicModel := SavedName;
    State.modelLoaded := True;
    // Dirty tracks user edits only. Account/catalogue readiness never deletes
    // a confirmed model or turns a restored selection into an unsaved edit.
    Meta.Text := JSONBeautify(State);
    ControlUpdateDepth := ControlUpdateDepth + 1;
    try
      (Child(Panel, 'Connection') as TComboBox).ItemIndex := SavedChoice;
      var LoadedModel := Child(Panel, 'Model') as TComboBox;
      if SavedChoice = 1 then ApplyOpenAICatalogue(Panel, View.account.models, SavedName)
      else
      begin
        LoadedModel.DropDownListStyle := lsEditList;
        LoadedModel.Text := SavedName;
      end;
    finally ControlUpdateDepth := ControlUpdateDepth - 1; end;
    State := JSON.Parse(Meta.Text);
    if View.modelSettings.confirmed then ShowPage(Panel, 'chat');
    State := JSON.Parse(Meta.Text);
  end;
  var Model := Child(Panel, 'Model') as TComboBox;
  if (Child(Panel, 'Connection') as TComboBox).ItemIndex = 0 then
  begin
    var TypedModel := Model.Text;
    var CatalogueChanged := Model.Items.Count <> View.localModels.length;
    if not CatalogueChanged then
      for var m := 0 to View.localModels.length - 1 do
        if Model.Items[m] <> View.localModels[m].name then CatalogueChanged := True;
    if CatalogueChanged then
    begin
      ControlUpdateDepth := ControlUpdateDepth + 1;
      try
        Model.Items.Clear;
        for var m := 0 to View.localModels.length - 1 do Model.Items.Add(View.localModels[m].name);
        Model.Text := TypedModel;
      finally ControlUpdateDepth := ControlUpdateDepth - 1; end;
    end;
  end;
  Meta.Text := JSONBeautify(State);
  Child(Panel, 'Send').Enabled := View.modelSettings.confirmed and View.modelReady and ModelMatches(Panel) and not JobWorking;
  if State.dirty or not ModelMatches(Panel) then SetStatus(Panel, 'Gem modelvalget for at bruge den valgte forbindelse.')
  else if JobWorking then SetStatus(Panel, 'Assistenten arbejder...')
  else if State.staleAnswer then SetStatus(Panel, 'Kalkulationen er ændret. Send spørgsmålet igen.')
  else if View.modelReady then SetStatus(Panel, 'Klar til dit spørgsmål.')
  else if View.modelChecking then SetStatus(Panel, 'Kontrollerer model og forbindelse...')
  else SetStatus(Panel, View.modelError);
  UpdateSummary(Panel);
  Child(Panel, 'Send').Caption := 'Send';
  Meta.Text := JSONBeautify(State);
  RenderPaged(Panel, 'transcript'); RenderPaged(Panel, 'material');
end;

procedure TNativeAI.CreatePanel(Host: TContainerControl);
begin
  var Key := ProjectKey;
  var Panel := TPanel.Create(Host);
  // Publish the marker only after construction and native handle creation.
  Panel.Tag := 0; Panel.Caption := ''; Panel.Visible := False;
  try
  Panel.Width := 380; Panel.Parent := Host; Panel.Align := alRight;
  Panel.Color := $00F8FAFC;
  Panel.Font.Name := 'Segoe UI'; Panel.Font.Size := 10; Panel.Font.Color := $00332B22;
  var Meta := TEdit.Create(Panel);
  Meta.Tag := 1; Meta.Visible := False;
  var State := JSON.NewObject;
  State.instanceId := InstanceId;
  State.projectId := Key; State.revision := -1;
  State.modelLoaded := False; State.dirty := False; State.jobId := '';
  State.transcriptPage := 0; State.materialPage := 0;
  State.transcriptPaged := False; State.materialPaged := False; State.transcriptFollow := True;
  State.accountPending := False; State.initialSnapshotPending := True; State.resultNeedsRefresh := False; State.staleAnswer := False;
  State.uiChoice := 0; State.savedChoice := -1; State.savedModel := ''; State.savedAuth := '';
  State.localModel := 'qwen3.5:9b'; State.openaiModel := ''; State.anthropicModel := '';
  State.openaiCatalogue := JSON.NewArray;
  State.accountText := 'Tilknyt ChatGPT for at se kontoens tilgængelige modeller.';
  State.panelText := 'Hvad vil du vide om den aktive kalkulation?';
  State.materialText := 'Vælg Materiale for at se tilgængelige linjer og bilag.';
  Meta.Text := JSONBeautify(State);

  var Header := TPanel.Create(Panel);
  Header.Tag := 17; Header.Parent := Panel; Header.Align := alTop;
  Header.Height := 112; Header.Caption := ''; Header.Color := $00F8FAFC;
  var Title := TLabel.Create(Panel);
  Title.Parent := Header; Title.Left := 13; Title.Top := 12;
  Title.Tag := 36; Title.Caption := 'Sigma AI'; Title.Font.Size := 16;
  var Refresh := TButton.Create(Panel);
  Refresh.Tag := 35; Refresh.Parent := Header; Refresh.Left := 187; Refresh.Top := 12; Refresh.Width := 73;
  Refresh.Caption := 'Opdater'; Refresh.OnClick := RefreshNow;
  var SettingsToggle := TButton.Create(Panel);
  SettingsToggle.Tag := 21; SettingsToggle.Parent := Header;
  SettingsToggle.Left := 267; SettingsToggle.Top := 12; SettingsToggle.Width := 98;
  SettingsToggle.Caption := 'Indstillinger'; SettingsToggle.OnClick := ToggleSettings;
  var Summary := TLabel.Create(Panel);
  Summary.Tag := 23; Summary.Parent := Header;
  Summary.Left := 13; Summary.Top := 42; Summary.Width := 243; Summary.Height := 24;
  Summary.AutoSize := False; Summary.Caption := 'Vælg forbindelse og model';
  var MaterialToggle := TButton.Create(Panel);
  MaterialToggle.Tag := 22; MaterialToggle.Parent := Header;
  MaterialToggle.Left := 267; MaterialToggle.Top := 46; MaterialToggle.Width := 98;
  MaterialToggle.Caption := 'Materiale'; MaterialToggle.OnClick := ToggleMaterials;
  var Status := TLabel.Create(Panel);
  Status.Tag := 2; Status.Parent := Header; Status.AutoSize := False; Status.WordWrap := True;
  Status.Left := 13; Status.Top := 72; Status.Width := 352; Status.Height := 36;
  Status.Font.Size := 9; Status.Font.Color := $006B6358;
  Status.Caption := 'Vælg forbindelse, vælg model, og gem.';

  var Settings := TPanel.Create(Panel);
  Settings.Tag := 18; Settings.Parent := Panel; Settings.Align := alClient;
  Settings.Width := 380; Settings.Height := 240;
  Settings.Caption := ''; Settings.Color := $00F1F5F9;
  var ConnectionLabel := TLabel.Create(Panel);
  ConnectionLabel.Parent := Settings; ConnectionLabel.Left := 13; ConnectionLabel.Top := 8;
  ConnectionLabel.Caption := 'Forbindelse'; ConnectionLabel.Font.Size := 9;
  var Connection := TComboBox.Create(Panel);
  Connection.Tag := 3; Connection.Parent := Settings;
  Connection.Left := 13; Connection.Top := 28; Connection.Width := 352;
  Connection.DropDownListStyle := lsFixedList;
  Connection.Items.Add('Lokal model'); Connection.Items.Add('OpenAI · ChatGPT'); Connection.Items.Add('Anthropic');
  Connection.ItemIndex := 0;
  var ModelLabel := TLabel.Create(Panel);
  ModelLabel.Parent := Settings; ModelLabel.Left := 13; ModelLabel.Top := 62;
  ModelLabel.Caption := 'Model'; ModelLabel.Font.Size := 9;
  var Model := TComboBox.Create(Panel);
  Model.Tag := 5; Model.Parent := Settings;
  Model.Left := 13; Model.Top := 82; Model.Width := 242;
  Model.DropDownListStyle := lsEditList; Model.Text := State.localModel;
  var Save := TButton.Create(Panel);
  Save.Tag := 6; Save.Parent := Settings; Save.Left := 263; Save.Top := 82; Save.Width := 102;
  Save.Caption := 'Gem modelvalg'; Save.OnClick := SaveModel;
  var Login := TButton.Create(Panel);
  Login.Tag := 14; Login.Parent := Settings; Login.Left := 13; Login.Top := 124; Login.Width := 215;
  Login.Caption := 'Continue with ChatGPT'; Login.Enabled := False; Login.OnClick := LoginAccount;
  var Logout := TButton.Create(Panel);
  Logout.Tag := 15; Logout.Parent := Settings; Logout.Left := 237; Logout.Top := 124; Logout.Width := 128;
  Logout.Caption := 'Log ud'; Logout.Enabled := False; Logout.OnClick := LogoutAccount;
  var AccountStatus := TLabel.Create(Panel);
  AccountStatus.Tag := 16; AccountStatus.Parent := Settings;
  AccountStatus.Left := 13; AccountStatus.Top := 164; AccountStatus.Width := 352; AccountStatus.Height := 58;
  AccountStatus.AutoSize := False; AccountStatus.WordWrap := True; AccountStatus.Font.Size := 9;
  AccountStatus.Caption := 'Lokal model kører på denne computer. Ingen cloudafsendelse.';

  var Bottom := TPanel.Create(Panel);
  Bottom.Tag := 24; Bottom.Parent := Panel; Bottom.Align := alBottom; Bottom.Height := 100; Bottom.Caption := ''; Bottom.Color := $00F8FAFC;
  var SharingNotice := TLabel.Create(Panel);
  SharingNotice.Tag := 25; SharingNotice.Parent := Bottom;
  SharingNotice.Left := 13; SharingNotice.Top := 0; SharingNotice.Width := 352; SharingNotice.Height := 26;
  SharingNotice.AutoSize := False; SharingNotice.WordWrap := True; SharingNotice.Font.Size := 9;
  SharingNotice.Caption := 'Lokal behandling · materialet bliver på denne computer.';
  var Draft := TMemo.Create(Panel);
  Draft.Tag := 9; Draft.Parent := Bottom; Draft.Left := 13; Draft.Top := 30; Draft.Width := 352; Draft.Height := 36;
  Draft.WordWrap := True; Draft.Color := $00FFFFFF; Draft.TabStop := True; Draft.WantReturns := True;
  Draft.SetOnKeypress(DraftKeypress);
  Draft.Hint := 'Sagen opdateres ved åbning, Opdater og Send samt én kontrol når svaret er færdigt. Brug piletaster og Ctrl+Home/Ctrl+End til længere tekst.'; Draft.ShowHint := True;
  var Send := TButton.Create(Panel);
  Send.Tag := 10; Send.Parent := Bottom; Send.Left := 13; Send.Top := 70; Send.Width := 107;
  Send.Caption := 'Send'; Send.Enabled := False; Send.OnClick := SendQuestion;
  var Hide := TButton.Create(Panel);
  Hide.Tag := 12; Hide.Parent := Bottom; Hide.Left := 297; Hide.Top := 70; Hide.Width := 68;
  Hide.Caption := 'Skjul'; Hide.OnClick := HidePanel;
  var WidthButton := TButton.Create(Panel);
  WidthButton.Parent := Bottom; WidthButton.Left := 135; WidthButton.Top := 70; WidthButton.Width := 100;
  WidthButton.Caption := 'Smal / bred'; WidthButton.OnClick := ToggleWidth;

  var MaterialPanel := TPanel.Create(Panel);
  MaterialPanel.Tag := 19; MaterialPanel.Parent := Panel; MaterialPanel.Align := alClient;
  MaterialPanel.Height := 246; MaterialPanel.Caption := ''; MaterialPanel.Color := $00F1F5F9; MaterialPanel.Visible := False;
  var ContextTitle := TLabel.Create(Panel);
  ContextTitle.Parent := MaterialPanel; ContextTitle.Align := alTop; ContextTitle.Height := 28;
  ContextTitle.AutoSize := False; ContextTitle.Caption := 'Materiale fra den aktive sag';
  var MaterialText := TMemo.Create(Panel);
  MaterialText.Tag := 20; MaterialText.Parent := MaterialPanel;
  MaterialText.Align := alClient;
  MaterialText.ReadOnly := True; MaterialText.WordWrap := True; MaterialText.Color := $00FFFFFF;
  MaterialText.TabStop := True; MaterialText.WantReturns := True;
  MaterialText.Text := State.materialText;
  var ChatPage := TPanel.Create(Panel);
  ChatPage.Tag := 26; ChatPage.Parent := Panel; ChatPage.Align := alClient; ChatPage.Caption := '';
  var TranscriptPager := TPanel.Create(Panel);
  TranscriptPager.Parent := ChatPage; TranscriptPager.Align := alBottom; TranscriptPager.Height := 28; TranscriptPager.Caption := '';
  var Earlier := TButton.Create(Panel);
  Earlier.Tag := 27; Earlier.Parent := TranscriptPager; Earlier.Left := 3; Earlier.Top := 0; Earlier.Width := 77;
  Earlier.Caption := 'Tidligere'; Earlier.OnClick := PageEarlier;
  var Next := TButton.Create(Panel);
  Next.Tag := 28; Next.Parent := TranscriptPager; Next.Left := 85; Next.Top := 0; Next.Width := 77;
  Next.Caption := 'Næste'; Next.OnClick := PageNext;
  var PageLabel := TLabel.Create(Panel);
  PageLabel.Tag := 30; PageLabel.Parent := TranscriptPager; PageLabel.Left := 168; PageLabel.Top := 5;
  PageLabel.Width := 93; PageLabel.AutoSize := False; PageLabel.Caption := '1 / 1';
  var Latest := TButton.Create(Panel);
  Latest.Tag := 29; Latest.Parent := TranscriptPager; Latest.Left := 268; Latest.Top := 0; Latest.Width := 93;
  Latest.Caption := 'Seneste'; Latest.OnClick := PageLatest;
  var Transcript := TMemo.Create(Panel);
  Transcript.Tag := 13; Transcript.Parent := ChatPage;
  Transcript.Align := alClient; Transcript.ReadOnly := True; Transcript.WordWrap := True; Transcript.Color := $00FFFFFF;
  Transcript.TabStop := True; Transcript.WantReturns := True;
  Transcript.Text := State.panelText;
  var MaterialPager := TPanel.Create(Panel);
  MaterialPager.Parent := MaterialPanel; MaterialPager.Align := alBottom; MaterialPager.Height := 28; MaterialPager.Caption := '';
  var MaterialEarlier := TButton.Create(Panel);
  MaterialEarlier.Tag := 31; MaterialEarlier.Parent := MaterialPager; MaterialEarlier.Left := 3; MaterialEarlier.Top := 0; MaterialEarlier.Width := 77;
  MaterialEarlier.Caption := 'Tidligere'; MaterialEarlier.OnClick := PageEarlier;
  var MaterialNext := TButton.Create(Panel);
  MaterialNext.Tag := 32; MaterialNext.Parent := MaterialPager; MaterialNext.Left := 85; MaterialNext.Top := 0; MaterialNext.Width := 77;
  MaterialNext.Caption := 'Næste'; MaterialNext.OnClick := PageNext;
  var MaterialPageLabel := TLabel.Create(Panel);
  MaterialPageLabel.Tag := 34; MaterialPageLabel.Parent := MaterialPager; MaterialPageLabel.Left := 168; MaterialPageLabel.Top := 5;
  MaterialPageLabel.Width := 93; MaterialPageLabel.AutoSize := False; MaterialPageLabel.Caption := '1 / 1';
  var MaterialLatest := TButton.Create(Panel);
  MaterialLatest.Tag := 33; MaterialLatest.Parent := MaterialPager; MaterialLatest.Left := 268; MaterialLatest.Top := 0; MaterialLatest.Width := 93;
  MaterialLatest.Caption := 'Seneste'; MaterialLatest.OnClick := PageLatest;
  // Showing the panel creates native combo handles and can emit OnChange.
  // Do not enter Sigma's grid automation while its controls are being shown.
  ShowPage(Panel, 'settings');
  Panel.Visible := True;
  Connection.OnChange := ConnectionChanged; Model.OnChange := ModelChanged;
  Panel.Tag := PanelTag;
  HasPanels := True;
  except
    // A failed first show must not leave an apparently reusable empty panel.
    Panel.Tag := 0;
    Panel.Parent := nil;
    Panel.Free;
    raise;
  end;
end;

procedure TNativeAI.TogglePanel(Sender: TRibbonItem);
begin
  try
    StartServer;
  except
    ShowMessage('Sigma AI-serveren kunne ikke startes. Kontrollér Start-SigmaAI-Server.vbs i C:\MAK-Sigma.');
    exit;
  end;
  var Panel := ActivePanel;
  if Panel <> nil then
  begin
    Panel.Visible := not Panel.Visible;
    if Panel.Visible then RefreshNow(nil);
    exit;
  end;
  var Host := ActiveHost;
  if Host = nil then
  begin
    ShowMessage('Vælg en kalkulationsside med et Sigma-grid først.');
    exit;
  end;
  // Retire only our exact legacy marker. Its old timer then finds no panel.
  // Never adopt components/callbacks belonging to a different script VM.
  for var i := Host.Controls.Count - 1 downto 0 do
  begin
    var Previous := Host.Controls.Items[i];
    if (Previous.Tag = LegacyPanelTag) or (Previous.Tag = PanelTag) then
    begin
      Previous.Tag := 0;
      Previous.Visible := False;
      Previous.Parent := nil;
    end;
  end;
  Busy := True;
  ControlUpdateDepth := ControlUpdateDepth + 1;
  try
    CreatePanel(Host);
  finally
    ControlUpdateDepth := ControlUpdateDepth - 1;
    Busy := False;
  end;
  RefreshNow(nil);
end;

procedure TNativeAI.HidePanel(Sender: TControl);
begin
  var Panel := ActivePanel;
  if Panel <> nil then Panel.Visible := False;
end;

procedure TNativeAI.SaveModel(Sender: TControl);
begin
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  Busy := True;
  try
    var Payload := JSON.NewObject;
    var Choice := (Child(Panel, 'Connection') as TComboBox).ItemIndex;
    if Choice > 0 then Payload.mode := 'cloud' else Payload.mode := 'local';
    Payload.model := Trim((Child(Panel, 'Model') as TComboBox).Text);
    if Payload.model = '' then raise Exception.Create('Vælg eller skriv en model før du gemmer.');
    if Choice = 1 then
    begin
      var KnownModel := False;
      var CatalogueState := JSON.Parse((Child(Panel, 'Meta') as TEdit).Text);
      var Catalogue := CatalogueState.openaiCatalogue;
      if not VarIsEmpty(Catalogue) and not VarIsNull(Catalogue) then
        for var k := 0 to Catalogue.length - 1 do
          if Catalogue[k] = Payload.model then KnownModel := True;
      if not KnownModel then raise Exception.Create('Afventer ChatGPT-kontoens modelkatalog. Det gemte valg bevares; prøv igen når forbindelsen er klar.');
    end;
    if Choice = 2 then Payload.provider := 'anthropic' else Payload.provider := 'openai';
    if Choice = 1 then Payload.auth := 'chatgpt';
    var Meta := Child(Panel, 'Meta') as TEdit;
    var State := JSON.Parse(Meta.Text);
    Meta.Text := JSONBeautify(State);
    var Reply := Request('/api/native/model/settings', JSONBeautify(Payload));
    if Reply = '' then SetStatus(Panel, 'Serveren svarer ikke; modelvalget er ikke bekræftet.')
    else
    begin
      var Data := JSON.Parse(Reply);
      if not VarIsEmpty(Data.error) and not VarIsNull(Data.error) and (Data.error <> '') then SetStatus(Panel, Data.error)
      else
      begin
        State.savedChoice := Choice; State.savedModel := Data.modelSettings.model; State.savedAuth := '';
        if not VarIsEmpty(Data.modelSettings.auth) and not VarIsNull(Data.modelSettings.auth) then State.savedAuth := Data.modelSettings.auth;
        State.dirty := False; State.modelLoaded := True;
        Meta.Text := JSONBeautify(State);
        ShowPage(Panel, 'chat');
        RefreshPanel(Panel);
      end;
    end;
  except
    on E: Exception do SetStatus(Panel, 'Modelvalg: ' + SafeError(E.Message));
  end;
  Busy := False;
end;

procedure TNativeAI.ApplyOpenAICatalogue(Panel: TPanel; Models: JSONVariant; Preferred: String);
begin
  var Meta := Child(Panel, 'Meta') as TEdit;
  var State := JSON.Parse(Meta.Text);
  var Actual := JSON.NewArray;
  var KnownPreferred := False;
  if not VarIsEmpty(Models) and not VarIsNull(Models) then
    for var i := 0 to Models.length - 1 do
    begin
      Actual[Actual.length] := Models[i].slug;
      if Models[i].slug = Preferred then KnownPreferred := True;
    end;
  State.openaiCatalogue := Actual;
  Meta.Text := JSONBeautify(State);
  var Model := Child(Panel, 'Model') as TComboBox;
  var Expected: Integer := Actual.length;
  if (Preferred <> '') and not KnownPreferred then Expected := Expected + 1;
  var Changed := Model.Items.Count <> Expected;
  if not Changed then
  begin
    for var i := 0 to Actual.length - 1 do
      if Model.Items[i] <> Actual[i] then Changed := True;
    if (Preferred <> '') and not KnownPreferred then
      if Model.Items[Expected - 1] <> Preferred then Changed := True;
  end;
  ControlUpdateDepth := ControlUpdateDepth + 1;
  try
    Model.DropDownListStyle := lsFixedList;
    if Changed then
    begin
      Model.Items.Clear;
      for var i := 0 to Actual.length - 1 do Model.Items.Add(Actual[i]);
      // Display only; SaveModel checks Actual, not this cached fallback.
      if (Preferred <> '') and not KnownPreferred then Model.Items.Add(Preferred);
    end;
    if Model.Text <> Preferred then Model.Text := Preferred;
  finally ControlUpdateDepth := ControlUpdateDepth - 1; end;
end;

procedure TNativeAI.RefreshAccount(Panel: TPanel);
begin
  var Choice := (Child(Panel, 'Connection') as TComboBox).ItemIndex;
  Child(Panel, 'Login').Visible := Choice = 1;
  Child(Panel, 'Logout').Visible := Choice = 1;
  Child(Panel, 'Login').Enabled := Choice = 1;
  Child(Panel, 'Logout').Enabled := False;
  if Choice <> 1 then
  begin
    if Choice = 0 then Child(Panel, 'AccountStatus').Caption := 'Lokalt på din computer. Qwen er kun et forslag; den valgte model kontrolleres før brug.'
    else Child(Panel, 'AccountStatus').Caption := 'Anthropic kræver serverens konfigurerede forbindelse.';
    exit;
  end;
  // Account status is independent of the current Sigma snapshot and never
  // starts a login, saves a model choice or transmits calculation material.
  var Reply := Request('/api/native/account', '');
  if Reply = '' then
  begin
    Child(Panel, 'AccountStatus').Caption := 'Kontostatus mangler: lokal server svarer ikke.';
    exit;
  end;
  var Account := JSON.Parse(Reply);
  if VarIsEmpty(Account.status) or VarIsNull(Account.status) then
  begin
    if not VarIsEmpty(Account.error) and not VarIsNull(Account.error) and (Account.error <> '') then
      Child(Panel, 'AccountStatus').Caption := Account.error
    else Child(Panel, 'AccountStatus').Caption := 'Kontostatus kunne ikke læses fra den lokale server.';
    exit;
  end;
  var Text := 'Tilknyt din ChatGPT-konto med Continue with ChatGPT.';
  if (Account.status = 'pending') or (Account.status = 'starting') or (Account.status = 'logging-in') or (Account.status = 'authenticating') or (Account.status = 'connecting') then
    Text := 'Fortsæt login i den officielle browser. Vi afventer din konto.';
  if (Account.status = 'disconnecting') or (Account.status = 'logging-out') then Text := 'Logger ud af ChatGPT...';
  if Account.connected then
  begin
    if Account.sharing and (Account.status = 'connected') then
      Text := 'ChatGPT er tilknyttet. Abonnementet bruges, når du klikker Send.'
    else Text := 'Kontoen er tilknyttet. Forbindelsen er endnu ikke klar til spørgsmål.';
    Child(Panel, 'Logout').Enabled := True;
  end;
  if not VarIsEmpty(Account.error) and not VarIsNull(Account.error) and (Account.error <> '') then
    Text := Text + ' ' + Account.error;
  Child(Panel, 'AccountStatus').Caption := Text;
  Child(Panel, 'AccountStatus').Hint := Text; Child(Panel, 'AccountStatus').ShowHint := True;
  var Meta := Child(Panel, 'Meta') as TEdit;
  var State := JSON.Parse(Meta.Text);
  var ModelsText := 'CHATGPT-MODELLER';
  var CurrentModel := (Child(Panel, 'Model') as TComboBox).Text;
  if CurrentModel = '' then CurrentModel := State.openaiModel;
  if not VarIsEmpty(Account.models) and not VarIsNull(Account.models) then
    for var i := 0 to Account.models.length - 1 do
      ModelsText := ModelsText + #13#10 + Account.models[i].slug + ' · ' + Account.models[i].display_name;
  State.accountText := ModelsText;
  State.accountPending := (Account.status = 'pending') or (Account.status = 'starting') or
    (Account.status = 'connecting') or (Account.status = 'disconnecting');
  Meta.Text := JSONBeautify(State);
  ApplyOpenAICatalogue(Panel, Account.models, CurrentModel);
  StoreText(Panel, 'material', ModelsText + #13#10#13#10 + ReadText(Panel, 'materialBody'));
  RenderPaged(Panel, 'material');
  UpdateSummary(Panel);
end;

procedure TNativeAI.StoreText(Panel: TPanel; Key: String; Text: String);
begin
  var State := JSON.Parse((Child(Panel, 'Meta') as TEdit).Text);
  var CacheKey := URLEncodedEncoder.Encode(State.projectId) + '|' + Key;
  if TextCache.Values[CacheKey] = Text then exit;
  TextCache.Values[CacheKey] := Text;
  TextVersion := TextVersion + 1;
  TextCache.Values[CacheKey + '|version'] := IntToStr(TextVersion);
end;

function TNativeAI.ReadText(Panel: TPanel; Key: String): String;
begin
  var State := JSON.Parse((Child(Panel, 'Meta') as TEdit).Text);
  Result := TextCache.Values[URLEncodedEncoder.Encode(State.projectId) + '|' + Key];
end;

procedure TNativeAI.RenderPaged(Panel: TPanel; Key: String);
begin
  if (Key = 'transcript') and not Child(Panel, 'ChatPage').Visible then exit;
  if (Key = 'material') and not Child(Panel, 'MaterialPanel').Visible then exit;
  var Memo := Child(Panel, 'Transcript') as TMemo;
  var Earlier := Child(Panel, 'TranscriptEarlier');
  var Next := Child(Panel, 'TranscriptNext');
  var Indicator := Child(Panel, 'TranscriptPage');
  if Key = 'material' then
  begin
    Memo := Child(Panel, 'MaterialText') as TMemo;
    Earlier := Child(Panel, 'MaterialEarlier'); Next := Child(Panel, 'MaterialNext');
    Indicator := Child(Panel, 'MaterialPage');
  end;
  var Stamp := RenderStamp(Panel, Key, Memo);
  if ReadText(Panel, Key + '|renderStamp') = Stamp then exit;
  var Columns := Memo.Width div (Memo.Font.Size + 4);
  if Columns < 12 then Columns := 12;
  var Rows := Memo.Height div (Memo.Font.Size + 10);
  if Rows < 2 then Rows := 2;
  // Short wrapped chunks plus one-line overlap avoid hidden text on short
  // Sigma grids without depending on an unexposed native scrollbar API.
  var Raw := TStringList.Create;
  var Wrapped := TStringList.Create;
  try
    Raw.Text := ReadText(Panel, Key);
    for var i := 0 to Raw.Count - 1 do
    begin
      var Line := Raw[i];
      if Line = '' then Wrapped.Add('');
      var Start := 1;
      while Start <= Length(Line) do
      begin
        Wrapped.Add(Copy(Line, Start, Columns));
        Start := Start + Columns;
      end;
    end;
    if Wrapped.Count = 0 then Wrapped.Add('');
    var Step := Rows - 1;
    var Count := 1;
    if Wrapped.Count > Rows then Count := ((Wrapped.Count - Rows + Step - 1) div Step) + 1;
    var Meta := Child(Panel, 'Meta') as TEdit;
    var State := JSON.Parse(Meta.Text);
    var Page: Integer := State.transcriptPage;
    var Initialized: Boolean := State.transcriptPaged;
    if Key = 'material' then begin Page := State.materialPage; Initialized := State.materialPaged; end;
    if not Initialized then Page := Count - 1;
    if (Key = 'transcript') and State.transcriptFollow then Page := Count - 1;
    if Page < 0 then Page := 0;
    if Page >= Count then Page := Count - 1;
    var First := Page * Step;
    if First > Wrapped.Count - Rows then First := Wrapped.Count - Rows;
    if First < 0 then First := 0;
    var Text := '';
    for var i := First to First + Rows - 1 do
      if i < Wrapped.Count then
      begin
        if i > First then Text := Text + #13#10;
        Text := Text + Wrapped[i];
      end;
    UpdateMemo(Memo, Text);
    Earlier.Enabled := Page > 0; Next.Enabled := Page < Count - 1;
    Indicator.Caption := IntToStr(Page + 1) + ' / ' + IntToStr(Count);
    if Key = 'material' then begin State.materialPage := Page; State.materialPaged := True; end
    else
    begin
      State.transcriptPage := Page; State.transcriptPaged := True;
      State.transcriptFollow := Page = Count - 1;
    end;
    Meta.Text := JSONBeautify(State);
    StoreText(Panel, Key + '|renderStamp', RenderStamp(Panel, Key, Memo));
  finally Wrapped.Free; Raw.Free; end;
end;

procedure TNativeAI.PageEarlier(Sender: TControl);
begin
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  var Meta := Child(Panel, 'Meta') as TEdit;
  var State := JSON.Parse(Meta.Text);
  var Key := 'transcript';
  if Sender.Tag = 31 then begin Key := 'material'; State.materialPage := State.materialPage - 1; end
  else begin State.transcriptPage := State.transcriptPage - 1; State.transcriptFollow := False; end;
  Meta.Text := JSONBeautify(State); RenderPaged(Panel, Key);
end;

procedure TNativeAI.PageNext(Sender: TControl);
begin
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  var Meta := Child(Panel, 'Meta') as TEdit;
  var State := JSON.Parse(Meta.Text);
  var Key := 'transcript';
  if Sender.Tag = 32 then begin Key := 'material'; State.materialPage := State.materialPage + 1; end
  else begin State.transcriptPage := State.transcriptPage + 1; State.transcriptFollow := False; end;
  Meta.Text := JSONBeautify(State); RenderPaged(Panel, Key);
end;

procedure TNativeAI.PageLatest(Sender: TControl);
begin
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  var Meta := Child(Panel, 'Meta') as TEdit;
  var State := JSON.Parse(Meta.Text);
  var Key := 'transcript';
  if Sender.Tag = 33 then begin Key := 'material'; State.materialPaged := False; end
  else begin State.transcriptPaged := False; State.transcriptFollow := True; end;
  Meta.Text := JSONBeautify(State); RenderPaged(Panel, Key);
end;

procedure TNativeAI.UpdateMemo(Memo: TMemo; Text: String);
begin
  // Do not rewrite unchanged text on status polls: native caret/selection and
  // the user's current scroll position then remain untouched.
  if Memo.Text <> Text then Memo.Text := Text;
end;

function TNativeAI.SafeError(Text: String): String;
begin
  // Transport exceptions may contain request headers; never display them.
  if (Pos('bearer', LowerCase(Text)) > 0) or (Pos('authorization:', LowerCase(Text)) > 0) then
    Result := 'Lokal godkendelse blev afvist. Kontrollér bridge-token.'
  else Result := Copy(Text, 1, 350);
end;

procedure TNativeAI.ShowPage(Panel: TPanel; Page: String);
begin
  Child(Panel, 'Settings').Visible := Page = 'settings';
  Child(Panel, 'MaterialPanel').Visible := Page = 'material';
  Child(Panel, 'ChatPage').Visible := Page = 'chat';
  Child(Panel, 'Composer').Visible := Page = 'chat';
  if Page = 'settings' then Child(Panel, 'SettingsToggle').Caption := 'Til chat'
  else Child(Panel, 'SettingsToggle').Caption := 'Indstillinger';
  if Page = 'material' then Child(Panel, 'MaterialToggle').Caption := 'Til chat'
  else Child(Panel, 'MaterialToggle').Caption := 'Materiale';
  if (Page = 'chat') and (ReadText(Panel, 'transcript') <> '') then RenderPaged(Panel, 'transcript');
  if (Page = 'material') and (ReadText(Panel, 'material') <> '') then RenderPaged(Panel, 'material');
end;

procedure TNativeAI.ToggleSettings(Sender: TControl);
begin
  var Panel := ActivePanel;
  if Panel = nil then exit;
  if Child(Panel, 'Settings').Visible then ShowPage(Panel, 'chat') else ShowPage(Panel, 'settings');
end;

procedure TNativeAI.ToggleMaterials(Sender: TControl);
begin
  var Panel := ActivePanel;
  if Panel = nil then exit;
  if Child(Panel, 'MaterialPanel').Visible then ShowPage(Panel, 'chat') else ShowPage(Panel, 'material');
end;

function TNativeAI.ModelMatches(Panel: TPanel): Boolean;
begin
  var State := JSON.Parse((Child(Panel, 'Meta') as TEdit).Text);
  var Choice := (Child(Panel, 'Connection') as TComboBox).ItemIndex;
  Result := not State.dirty and (Choice = State.savedChoice) and
    (Trim((Child(Panel, 'Model') as TComboBox).Text) = State.savedModel);
  if Choice = 1 then Result := Result and (State.savedAuth = 'chatgpt');
end;

procedure TNativeAI.UpdateSummary(Panel: TPanel);
begin
  var Choice := (Child(Panel, 'Connection') as TComboBox).ItemIndex;
  var Provider := 'Lokal';
  if Choice = 1 then Provider := 'ChatGPT';
  if Choice = 2 then Provider := 'Anthropic';
  var Model := Trim((Child(Panel, 'Model') as TComboBox).Text);
  if Model = '' then Model := 'vælg model';
  Child(Panel, 'Summary').Caption := Provider + ' · ' + Model;
  if Choice = 0 then
    Child(Panel, 'SharingNotice').Caption := 'Lokal behandling · sagen opdateres ved åbning, Opdater og Send.'
  else if Choice = 1 then
    Child(Panel, 'SharingNotice').Caption := 'OpenAI modtager dit spørgsmål og relevante uddrag fra den aktive sag.'
  else Child(Panel, 'SharingNotice').Caption := 'Anthropic modtager dit spørgsmål og relevante uddrag fra den aktive sag.';
end;

procedure TNativeAI.ModelChanged(Sender: TControl);
begin
  if Busy or (ControlUpdateDepth > 0) then exit;
  var Panel := ActivePanel;
  if Panel = nil then exit;
  Busy := True;
  try
    var Meta := Child(Panel, 'Meta') as TEdit;
    var State := JSON.Parse(Meta.Text);
    var Choice := (Child(Panel, 'Connection') as TComboBox).ItemIndex;
    var Value := Trim((Child(Panel, 'Model') as TComboBox).Text);
    var PreviousValue := '';
    if Choice = 0 then PreviousValue := State.localModel;
    if Choice = 1 then PreviousValue := State.openaiModel;
    if Choice = 2 then PreviousValue := State.anthropicModel;
    // Also ignore delayed native change notifications after a guarded update.
    if Value = PreviousValue then exit;
    if Choice = 0 then State.localModel := Value;
    if Choice = 1 then State.openaiModel := Value;
    if Choice = 2 then State.anthropicModel := Value;
    State.dirty := True; State.modelLoaded := True;
    Meta.Text := JSONBeautify(State);
    Child(Panel, 'Send').Enabled := False;
    SetStatus(Panel, 'Modelvalget er ændret. Klik Gem modelvalg.');
    UpdateSummary(Panel);
  finally Busy := False; end;
end;

procedure TNativeAI.ConnectionChanged(Sender: TControl);
begin
  if Busy or (ControlUpdateDepth > 0) then exit;
  var Panel := ActivePanel;
  if Panel = nil then exit;
  Busy := True;
  try
    var Meta := Child(Panel, 'Meta') as TEdit;
    var State := JSON.Parse(Meta.Text);
    var SelectedChoice := (Child(Panel, 'Connection') as TComboBox).ItemIndex;
    if SelectedChoice = State.uiChoice then begin Busy := False; exit; end;
    var Model := Child(Panel, 'Model') as TComboBox;
    var Previous := Trim(Model.Text);
    if State.uiChoice = 0 then State.localModel := Previous;
    if State.uiChoice = 1 then State.openaiModel := Previous;
    if State.uiChoice = 2 then State.anthropicModel := Previous;
    var Choice := (Child(Panel, 'Connection') as TComboBox).ItemIndex;
    var NewModel := '';
    if Choice = 0 then NewModel := State.localModel;
    if Choice = 1 then NewModel := State.openaiModel;
    if Choice = 2 then NewModel := State.anthropicModel;
    if (Choice > 0) and (Pos('qwen', LowerCase(NewModel)) = 1) then NewModel := '';
    State.uiChoice := Choice; State.dirty := True; State.modelLoaded := True;
    Meta.Text := JSONBeautify(State);
    ControlUpdateDepth := ControlUpdateDepth + 1;
    try
      if Choice = 1 then
      begin
        // Cached slugs are only display data until RefreshAccount validates.
        var CachedModels := JSON.NewArray;
        for var k := 0 to State.openaiCatalogue.length - 1 do
        begin
          var Entry := JSON.NewObject; Entry.slug := State.openaiCatalogue[k]; CachedModels[k] := Entry;
        end;
        ApplyOpenAICatalogue(Panel, CachedModels, NewModel);
      end else
      begin
        Model.Items.Clear; Model.DropDownListStyle := lsEditList; Model.Text := NewModel;
      end;
    finally ControlUpdateDepth := ControlUpdateDepth - 1; end;
    Child(Panel, 'Send').Enabled := False;
    UpdateSummary(Panel);
    RefreshAccount(Panel);
    SetStatus(Panel, 'Vælg model for forbindelsen, og gem modelvalget.');
  except
    on E: Exception do Child(Panel, 'AccountStatus').Caption := 'Forbindelse: ' + SafeError(E.Message);
  end;
  Busy := False;
end;

procedure TNativeAI.LoginAccount(Sender: TControl);
begin
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  if (Child(Panel, 'Connection') as TComboBox).ItemIndex <> 1 then
  begin
    SetStatus(Panel, 'Vælg OpenAI før Continue with ChatGPT.');
    exit;
  end;
  Busy := True;
  try
    Child(Panel, 'Send').Enabled := False;
    var Meta := Child(Panel, 'Meta') as TEdit;
    var State := JSON.Parse(Meta.Text); State.accountPending := True; Meta.Text := JSONBeautify(State);
    var Reply := Request('/api/native/account/login', '{}');
    if Reply = '' then SetStatus(Panel, 'Login blev ikke bekræftet. Kontrollér den lokale server.')
    else
    begin
      var Data := JSON.Parse(Reply);
      if not VarIsEmpty(Data.error) and not VarIsNull(Data.error) and (Data.error <> '') then
        SetStatus(Panel, Data.error)
      else SetStatus(Panel, 'Fortsæt selv i det officielle ChatGPT-login i browseren. Ingen sagsdata er sendt.');
    end;
    RefreshAccount(Panel);
  except
    SetStatus(Panel, 'ChatGPT-login kunne ikke startes. Kontrollér den lokale server.');
  end;
  Busy := False;
end;

procedure TNativeAI.LogoutAccount(Sender: TControl);
begin
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  Busy := True;
  try
    Child(Panel, 'Send').Enabled := False;
    var Reply := Request('/api/native/account/logout', '{}');
    if Reply = '' then SetStatus(Panel, 'Logud blev ikke bekræftet. Kontrollér den lokale server.')
    else
    begin
      var Data := JSON.Parse(Reply);
      if not VarIsEmpty(Data.error) and not VarIsNull(Data.error) and (Data.error <> '') then SetStatus(Panel, Data.error)
      else SetStatus(Panel, 'Logud er startet. Afventer forbindelsens status.');
    end;
    RefreshAccount(Panel);
  except
    SetStatus(Panel, 'ChatGPT-logud kunne ikke bekræftes. Kontrollér den lokale server.');
  end;
  Busy := False;
end;

procedure TNativeAI.ResizePanel(Panel: TPanel; NewWidth: Integer);
begin
  if (NewWidth <> 380) and (NewWidth <> 456) then exit;
  var OldWidth := Panel.Width;
  if OldWidth = NewWidth then exit;
  for var i := 0 to Panel.ComponentCount - 1 do
    if Panel.Components[i] is TControl then
    begin
      var Control := Panel.Components[i] as TControl;
      if Control.Align = alNone then
      begin
        Control.Left := Round(Control.Left * NewWidth / OldWidth);
        Control.Width := Round(Control.Width * NewWidth / OldWidth);
      end;
    end;
  Panel.Width := NewWidth;
end;

procedure TNativeAI.ToggleWidth(Sender: TControl);
begin
  var Panel := ActivePanel;
  if Panel = nil then exit;
  var Width := 456;
  if Panel.Width > 400 then Width := 380;
  var Payload := JSON.NewObject; Payload.width := Width;
  Request('/api/native/panel', JSONBeautify(Payload));
  ResizePanel(Panel, Width);
end;

procedure TNativeAI.DraftKeypress(Sender: TControl; var Key: String);
begin
  if Key <> #13 then exit;
  Key := '';
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  if not Child(Panel, 'Send').Enabled then exit;
  SendQuestion(Sender);
end;

procedure TNativeAI.SendQuestion(Sender: TControl);
begin
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  if not ModelMatches(Panel) then
  begin
    SetStatus(Panel, 'Gem modelvalget før du sender.');
    ShowPage(Panel, 'settings');
    exit;
  end;
  var Question := Trim((Child(Panel, 'Draft') as TMemo).Text);
  if Question = '' then exit;
  Busy := True;
  try
    // Only this explicit click transmits a question. Snapshot remains local.
    Snapshot(Panel);
    var Meta := Child(Panel, 'Meta') as TEdit;
    var State := JSON.Parse(Meta.Text);
    State.resultNeedsRefresh := False; State.staleAnswer := False; Meta.Text := JSONBeautify(State);
    var Payload := JSON.NewObject;
    Payload.question := Question; Payload.projectId := State.projectId; Payload.revision := State.revision;
    Payload.sendContext := (Child(Panel, 'Connection') as TComboBox).ItemIndex > 0;
    var Reply := Request('/api/native/chat', JSONBeautify(Payload));
    if Reply = '' then SetStatus(Panel, 'Serveren svarer ikke; spørgsmålet er ikke bekræftet sendt.')
    else
    begin
      var Data := JSON.Parse(Reply);
      if not VarIsEmpty(Data.error) and not VarIsNull(Data.error) and (Data.error <> '') then SetStatus(Panel, Data.error)
      else
      begin
        State.jobId := Data.jobId; State.transcriptPaged := False; State.transcriptFollow := True;
        Meta.Text := JSONBeautify(State);
        (Child(Panel, 'Draft') as TMemo).Text := '';
        Child(Panel, 'Send').Enabled := False;
        SetStatus(Panel, 'Assistenten arbejder...');
        RefreshPanel(Panel);
      end;
    end;
  except
    on E: Exception do SetStatus(Panel, 'Spørgsmålet kunne ikke behandles: ' + SafeError(E.Message));
  end;
  Busy := False;
end;

function TNativeAI.CheckReply(Reply: String; Success: Boolean): String;
begin
  if Reply = '' then raise Exception.Create('Lokal server svarer ikke. Klik Opdater for at prøve igen.');
  if not Success then
  begin
    var Problem := 'Lokal server afviste forespørgslen. Klik Opdater for at prøve igen.';
    try
      var Data := JSON.Parse(Reply);
      if not VarIsEmpty(Data.error) and not VarIsNull(Data.error) and (Data.error <> '') then Problem := Data.error;
    except
      // A non-JSON error body is never copied into the product UI.
    end;
    raise Exception.Create(Problem);
  end;
  Result := Reply;
end;

function TNativeAI.RenderStamp(Panel: TPanel; Key: String; Memo: TMemo): String;
begin
  var State := JSON.Parse((Child(Panel, 'Meta') as TEdit).Text);
  Result := ReadText(Panel, Key + '|version') + ':' + IntToStr(Memo.Width) + ':' +
    IntToStr(Memo.Height) + ':' + IntToStr(Memo.Font.Size);
  if Key = 'material' then Result := Result + ':' + VarToStr(State.materialPage) + ':' + VarToStr(State.materialPaged)
  else Result := Result + ':' + VarToStr(State.transcriptPage) + ':' + VarToStr(State.transcriptPaged) + ':' + VarToStr(State.transcriptFollow);
end;

procedure TNativeAI.StartServer;
begin
  if ServerStarted then exit;
  // Start only our fixed local helper, once on explicit opening. No terminal,
  // no wait, no login/model changes, and never from a timer callback.
  var Launcher := CreateOleObject('WScript.Shell');
  Launcher.Run('wscript.exe "C:\MAK-Sigma\Start-SigmaAI-Server.vbs"', 0, False);
  ServerStarted := True;
end;

procedure TNativeAI.RefreshNow(Sender: TControl);
begin
  var Panel := ActivePanel;
  if (Panel = nil) or Busy then exit;
  Busy := True;
  try
    // Read on explicit opening/Opdater; Send and one completed-job check also refresh.
    Snapshot(Panel);
    var Meta := Child(Panel, 'Meta') as TEdit;
    var State := JSON.Parse(Meta.Text); State.initialSnapshotPending := False; State.resultNeedsRefresh := False; Meta.Text := JSONBeautify(State);
    RefreshPanel(Panel);
    if Child(Panel, 'Settings').Visible then RefreshAccount(Panel);
    Timer.Interval := 10000;
  except
    on E: Exception do
    begin
      SetStatus(Panel, 'Forbindelse: ' + SafeError(E.Message));
      Child(Panel, 'Send').Enabled := False;
      Timer.Interval := 15000;
    end;
  end;
  Busy := False;
end;

procedure TNativeAI.Tick(Sender: TTimer);
begin
  if Busy then exit;
  var Panel := ActivePanel;
  if (Panel = nil) or not Panel.Visible then exit;
  Busy := True;
  try
    // No recurring calculation scans: only deferred initial opening and one
    // completed-job check may read the grid. Failed HTTP calls stop this cycle.
    var State := JSON.Parse((Child(Panel, 'Meta') as TEdit).Text);
    if State.initialSnapshotPending then
    begin
      // A server launched on opening may not yet be listening. Probe cheaply
      // before the one deferred initial read; never retry full grid traversal
      // automatically after an invalid snapshot. Opdater remains explicit.
      Request('/api/native/account', '');
      State.initialSnapshotPending := False;
      (Child(Panel, 'Meta') as TEdit).Text := JSONBeautify(State);
      Snapshot(Panel);
      State := JSON.Parse((Child(Panel, 'Meta') as TEdit).Text);
    end;
    if Child(Panel, 'Settings').Visible or State.accountPending then RefreshAccount(Panel);
    if State.revision >= 0 then RefreshPanel(Panel);
    Timer.Interval := 10000;
  except
    on E: Exception do
    begin
      SetStatus(Panel, 'Forbindelse: ' + SafeError(E.Message));
      Child(Panel, 'Send').Enabled := False;
      Timer.Interval := 15000;
    end;
  end;
  Busy := False;
end;

procedure TNativeAI.Install;
begin
  if MenuGroup <> nil then exit;
  // This Sigma version faults in TRibbonTabGroups.GetItem when existing
  // native groups are enumerated. Do not index that collection or pass the
  // native Ribbon wrapper as owner to a control constructor. MenuGroup above
  // guards repeat Install calls; finalization removes this instance's group.
  for var i := 0 to Ribbon.Tabs.Count - 1 do
  begin
    var Tab := Ribbon.Tabs[i];
    if (Tab.Caption = 'Værktøjer') or (Tab.Caption = '&Værktøjer') or (Tab.Caption = 'Tools') or (Tab.Caption = '&Tools') then
    begin
      MenuGroup := Tab.Groups.Add;
      MenuGroup.Caption := 'Sigma AI';
      MenuGroup.Visible := True;
      var Button := MenuGroup.Items.Add(TRibbonLargeButtonItem);
      Button.Caption := 'Sigma AI';
      Button.Visible := True;
      Button.Enabled := True;
      Button.OnClick := TogglePanel;
      Timer := TTimer.Create(nil); Timer.Interval := 10000; Timer.OnTimer := Tick; Timer.Enabled := True;
      Tab.Visible := True;
      Tab.Activate;
      Ribbon.Refresh;
      exit;
    end;
  end;
  ShowMessage('Fanen Værktøjer blev ikke fundet.');
end;

procedure TNativeAI.DetachPanels;
begin
  // Re-discover every open project's pages. Never dereference a closed project.
  for var p := 0 to Application.Projects.Count - 1 do
    for var n := 0 to Application.Projects[p].Pages.Count - 1 do
    begin
      var Reader := GetGridReader(Application.Projects[p].Pages[n].GetUserInterfaceAutomation);
      if Reader <> nil then
      begin
        var Grid := Reader.Control;
        if Grid is TControl then
        begin
          var Host := (Grid as TControl).Parent;
          if Host <> nil then
            for var i := Host.Controls.Count - 1 downto 0 do
            begin
              var Candidate := Host.Controls.Items[i];
              if Candidate.Tag = PanelTag then
              begin
                var OwnedMeta := Child(Candidate as TPanel, 'Meta') as TEdit;
                if OwnedMeta = nil then continue;
                var OwnedState := JSON.Parse(OwnedMeta.Text);
                if OwnedState.instanceId <> InstanceId then continue;
                Candidate.Visible := False;
                Candidate.Tag := 0;
                Candidate.Parent := nil;
                // Host owns controls. Disconnect callbacks before this unit ends.
                var Panel := Candidate as TPanel;
                Child(Panel, 'Send').OnClick := nil;
                Child(Panel, 'Save').OnClick := nil; Child(Panel, 'Hide').OnClick := nil;
                Child(Panel, 'Login').OnClick := nil; Child(Panel, 'Logout').OnClick := nil;
                (Child(Panel, 'Connection') as TComboBox).OnChange := nil;
                (Child(Panel, 'Model') as TComboBox).OnChange := nil;
                Child(Panel, 'Refresh').OnClick := nil;
                Child(Panel, 'SettingsToggle').OnClick := nil; Child(Panel, 'MaterialToggle').OnClick := nil;
                Child(Panel, 'TranscriptEarlier').OnClick := nil; Child(Panel, 'TranscriptNext').OnClick := nil; Child(Panel, 'TranscriptLatest').OnClick := nil;
                Child(Panel, 'MaterialEarlier').OnClick := nil; Child(Panel, 'MaterialNext').OnClick := nil; Child(Panel, 'MaterialLatest').OnClick := nil;
              end;
            end;
        end;
      end;
    end;
end;

initialization
  var NativeAI := TNativeAI.Create;
  NativeAI.InstanceId := CreateGUID;
  NativeAI.TextCache := TStringList.Create;
  NativeAI.Install;
finalization
  if NativeAI.Timer <> nil then begin NativeAI.Timer.Enabled := False; NativeAI.Timer.Free; end;
  if NativeAI.HasPanels then NativeAI.DetachPanels;
  if NativeAI.MenuGroup <> nil then NativeAI.MenuGroup.Free;
  NativeAI.TextCache.Free;
  NativeAI.Free;







