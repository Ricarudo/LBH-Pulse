#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef SourceRoot
  #define SourceRoot "..\.."
#endif

#define AppName "Pulse"
#define AppPublisher "LBH"
#define AppRoot "{commonappdata}\LBH\Pulse"

[Setup]
AppId={{C8A8D729-511B-45C4-BE33-26DB95091BE7}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={#AppRoot}
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=Pulse-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Pulse {#AppVersion}
SetupLogging=yes
#ifdef PulseSign
SignTool=pulse
SignedUninstaller=yes
#else
SignedUninstaller=no
#endif

[Files]
Source: "{#SourceRoot}\installer\windows\Pulse.Install.psm1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "{#SourceRoot}\installer\windows\*.ps1"; DestDir: "{app}\installer"; Excludes: "sign-installer.ps1"; Flags: ignoreversion
Source: "{#SourceRoot}\compose.production.yaml"; DestDir: "{app}\installer\payload\deployment"; Flags: ignoreversion
Source: "{#SourceRoot}\compose.maintenance.yaml"; DestDir: "{app}\installer\payload\deployment"; Flags: ignoreversion
Source: "{#SourceRoot}\compose.release.yaml"; DestDir: "{app}\installer\payload\deployment"; Flags: ignoreversion
Source: "{#SourceRoot}\installer\windows\generated\release-manifest.json"; DestDir: "{app}\installer\payload\deployment"; Flags: ignoreversion
Source: "{#SourceRoot}\docs\production\windows-installer.md"; DestDir: "{app}\installer"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Pulse\Open Pulse"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\manage-pulse.ps1"" -Action Open"; WorkingDir: "{app}"
Name: "{autoprograms}\Pulse\Start Pulse"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\manage-pulse.ps1"" -Action Start"; WorkingDir: "{app}"
Name: "{autoprograms}\Pulse\Stop Pulse"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\manage-pulse.ps1"" -Action Stop"; WorkingDir: "{app}"
Name: "{autoprograms}\Pulse\Check health"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\manage-pulse.ps1"" -Action Health"; WorkingDir: "{app}"
Name: "{autoprograms}\Pulse\View sanitized logs"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\manage-pulse.ps1"" -Action Logs"; WorkingDir: "{app}"
Name: "{autoprograms}\Pulse\Complete first-run setup"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\manage-pulse.ps1"" -Action CompleteSetup"; WorkingDir: "{app}"

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "{code:GetUninstallParameters}"; Flags: waituntilterminated; RunOnceId: "PulseSafeUninstall"

[Code]
var
  ModePage: TInputOptionWizardPage;
  PublicPage: TInputQueryWizardPage;
  BackupPage: TInputDirWizardPage;
  TrustPage: TInputOptionWizardPage;
  SetupCodeLabel: TNewStaticText;
  SetupCodeEdit: TNewEdit;
  DeletePulseData: Boolean;
  RemovePulseCa: Boolean;

procedure InitializeWizard;
begin
  ModePage := CreateInputOptionPage(wpWelcome, 'Pulse HTTPS mode', 'Where will Pulse be used?',
    'Local-only is the safest and simplest first installation.', True, False);
  ModePage.Add('Local-only HTTPS at https://localhost:8443');
  ModePage.Add('Public-domain HTTPS using ports 80 and 443');
  ModePage.SelectedValueIndex := 0;

  PublicPage := CreateInputQueryPage(ModePage.ID, 'Public HTTPS', 'Domain and certificate contact',
    'These values are used only for public-domain mode.');
  PublicPage.Add('Pulse hostname:', False);
  PublicPage.Add('ACME contact email:', False);

  BackupPage := CreateInputDirPage(PublicPage.ID, 'Backup destination',
    'Choose where encrypted Pulse backups are stored.', '', False, 'New Folder');
  BackupPage.Add('');
  // The {app} constant is not initialized while the wizard pages are being created.
  BackupPage.Values[0] := ExpandConstant('{commonappdata}\LBH\Pulse\backups');

  TrustPage := CreateInputOptionPage(BackupPage.ID, 'Local HTTPS trust',
    'Trust the Pulse internal certificate on this computer?',
    'This changes only the LocalMachine trusted-root store and can be removed during uninstall.', False, False);
  TrustPage.Add('Trust the generated Pulse internal CA on this computer');
  TrustPage.Values[0] := False;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := ((PageID = PublicPage.ID) and (ModePage.SelectedValueIndex = 0)) or
    ((PageID = TrustPage.ID) and (ModePage.SelectedValueIndex = 1));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = PublicPage.ID) and (ModePage.SelectedValueIndex = 1) then begin
    if (Pos('.', PublicPage.Values[0]) = 0) or (Pos('@', PublicPage.Values[1]) = 0) then begin
      MsgBox('Enter a valid public hostname and ACME contact email.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function PowerShellParameters: String;
var
  Mode, Hostname, Email, Trust: String;
begin
  if ModePage.SelectedValueIndex = 0 then begin
    Mode := 'internal'; Hostname := 'localhost'; Email := 'operator@example.invalid';
    if TrustPage.Values[0] then Trust := ' -TrustInternalCa' else Trust := '';
  end else begin
    Mode := 'public'; Hostname := PublicPage.Values[0]; Email := PublicPage.Values[1]; Trust := '';
  end;
  Result := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\installer\install-pulse.ps1') +
    '" -Root "' + ExpandConstant('{app}') + '" -Mode ' + Mode + ' -Hostname "' + Hostname +
    '" -AcmeEmail "' + Email + '" -BackupPath "' + BackupPage.Values[0] + '"' + Trust;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if FileExists(ExpandConstant('{app}\installer\state.json')) then begin
      if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
        '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\installer\update-pulse.ps1') + '" -Root "' + ExpandConstant('{app}') + '"',
        ExpandConstant('{app}'), SW_SHOW, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
        RaiseException('Pulse update failed. Review the sanitized installer log.');
    end else if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), PowerShellParameters,
      ExpandConstant('{app}'), SW_SHOW, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      RaiseException('Pulse installation failed. Review the sanitized installer log.');
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
var
  Code: AnsiString;
begin
  if CurPageID = wpFinished then begin
    if not Assigned(SetupCodeLabel) then begin
      SetupCodeLabel := TNewStaticText.Create(WizardForm);
      SetupCodeLabel.Parent := WizardForm.FinishedPage;
      SetupCodeLabel.Top := WizardForm.FinishedLabel.Top + WizardForm.FinishedLabel.Height + ScaleY(16);
      SetupCodeLabel.Caption := 'One-time setup code (never share or log this value):';
      SetupCodeEdit := TNewEdit.Create(WizardForm);
      SetupCodeEdit.Parent := WizardForm.FinishedPage;
      SetupCodeEdit.Top := SetupCodeLabel.Top + SetupCodeLabel.Height + ScaleY(6);
      SetupCodeEdit.Width := WizardForm.FinishedPage.ClientWidth;
      SetupCodeEdit.ReadOnly := True;
      if LoadStringFromFile(ExpandConstant('{app}\config\first-run-code.txt'), Code) then
        SetupCodeEdit.Text := String(Code);
    end;
  end;
end;

function GetPulseUrl(Param: String): String;
begin
  if ModePage.SelectedValueIndex = 0 then Result := 'https://localhost:8443'
  else Result := 'https://' + PublicPage.Values[0];
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  if UninstallSilent then Exit;
  DeletePulseData := MsgBox(
    'Pulse will preserve configuration, backups, and Docker volumes by default.' + #13#10 + #13#10 +
    'Do you want to permanently delete the Pulse PostgreSQL and MinIO volumes?',
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  RemovePulseCa := MsgBox(
    'Remove the installer-managed Pulse internal CA certificate, if one was trusted?',
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
end;

function GetUninstallParameters(Param: String): String;
begin
  Result := '-NoProfile -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{app}\installer\uninstall-pulse.ps1') + '"';
  if DeletePulseData then Result := Result + ' -RemoveData';
  if RemovePulseCa then Result := Result + ' -RemoveInternalCa';
  if UninstallSilent then Result := Result + ' -Silent';
end;

[Run]
Filename: "{code:GetPulseUrl}"; Description: "Open Pulse to create the Administrator"; Flags: postinstall shellexec skipifsilent nowait
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\manage-pulse.ps1"" -Action CompleteSetup -WaitForSetupSeconds 1800"; Description: "Finalize protected first-run setup"; Flags: postinstall runhidden skipifsilent waituntilterminated
