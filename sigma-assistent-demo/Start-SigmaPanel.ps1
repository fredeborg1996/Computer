param(
  [ValidateSet('Toggle','Show','Hide','Status')][string]$Action = 'Toggle',
  [ValidateRange(1024,65535)][int]$Port = $(if ($env:SIGMA_PANEL_PORT) { [int]$env:SIGMA_PANEL_PORT } elseif ($env:PORT) { [int]$env:PORT } else { 4317 }),
  [switch]$NoServer,
  [switch]$NoErrorDialog
)
# Separate Edge app window, not a native Sigma dock panel. Discovery of the
# dedicated profile's real HWND recovers state after launcher/Sigma restarts.
# Guest mode prevents automatic Windows-account sign-in and browser-data sync.
# Model choices remain persisted by the local server, independently of the browser.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class SigmaPanelWindows {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr param);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder name, int max);
  public static long[] Find(int[] pids) {
    var result = new List<long>(); var ids = new HashSet<int>(pids);
    EnumWindows((h,p) => { uint pid; GetWindowThreadProcessId(h,out pid);
      var name = new System.Text.StringBuilder(256); GetClassName(h,name,256);
      if(ids.Contains((int)pid) && name.ToString()=="Chrome_WidgetWin_1" && GetWindowTextLength(h)>0) result.Add(h.ToInt64());
      return true; }, IntPtr.Zero);
    return result.ToArray();
  }
}
"@
$profile = Join-Path $env:LOCALAPPDATA "MAK-Sigma\Panel-$Port"
function Get-PanelWindows {
  $processIds = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($profile, [StringComparison]::OrdinalIgnoreCase) -ge 0 } |
    ForEach-Object { [int]$_.ProcessId })
  if ($processIds.Count -eq 0) { return }
  [SigmaPanelWindows]::Find([int[]]$processIds)
}
$mutex = New-Object System.Threading.Mutex($false, "Local\MAK-Sigma-Panel-$Port")
$locked = $false
try {
  try { $locked = $mutex.WaitOne(30000) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { throw 'Assistenten er stadig ved at starte. Prøv igen om et øjeblik.' }
  $windows = @(Get-PanelWindows)
  if ($Action -eq 'Status') {
    [pscustomobject]@{ port=$Port; windows=@($windows | ForEach-Object {
      [pscustomobject]@{ handle=$_; visible=[SigmaPanelWindows]::IsWindowVisible([IntPtr]$_); minimized=[SigmaPanelWindows]::IsIconic([IntPtr]$_) }
    }) } | ConvertTo-Json -Depth 4 -Compress
    return
  }
  if ($windows.Count -gt 1) { throw 'Flere assistentvinduer blev fundet. Luk de ekstra assistentvinduer manuelt og prøv igen.' }
  if ($windows.Count -eq 1) {
    $handle = [IntPtr]$windows[0]
    $visible = [SigmaPanelWindows]::IsWindowVisible($handle)
    if ($Action -eq 'Hide' -or ($Action -eq 'Toggle' -and $visible -and -not [SigmaPanelWindows]::IsIconic($handle))) {
      $null = [SigmaPanelWindows]::ShowWindow($handle, 0)
    } else {
      $null = [SigmaPanelWindows]::ShowWindow($handle, 9)
      $null = [SigmaPanelWindows]::SetForegroundWindow($handle)
    }
    return
  }
  if ($Action -eq 'Hide') { return }
  if (-not $NoServer) { & (Join-Path $PSScriptRoot 'Start-Demo.ps1') -NoBrowser -Port $Port }
  $edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
  if (-not (Test-Path -LiteralPath $edge)) { $edge = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe' }
  if (-not (Test-Path -LiteralPath $edge)) { throw 'Microsoft Edge blev ikke fundet. Installér Edge for at åbne assistentvinduet.' }
  Add-Type -AssemblyName System.Windows.Forms
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $width = [Math]::Min(520,$area.Width)
  $left = [Math]::Max($area.Left,$area.Right-$width)
  $args = @("--user-data-dir=`"$profile`"", '--guest', '--no-first-run', '--no-default-browser-check', '--disable-background-mode', "--app=http://127.0.0.1:$Port/?panel=1", "--window-size=$width,$($area.Height)", "--window-position=$left,$($area.Top)")
  Start-Process -FilePath $edge -ArgumentList $args -WindowStyle Hidden
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 200
    $windows = @(Get-PanelWindows)
  } while ($windows.Count -eq 0 -and [DateTime]::UtcNow -lt $deadline)
  if ($windows.Count -eq 0) { throw 'Assistentvinduet blev ikke åbnet inden for 20 sekunder. Prøv igen.' }
  $null = [SigmaPanelWindows]::ShowWindow([IntPtr]$windows[0], 9)
  $null = [SigmaPanelWindows]::SetForegroundWindow([IntPtr]$windows[0])
} catch {
  # Report only a curated message; no server responses, tokens or document data.
  $message = 'Sigma-assistenten kunne ikke åbnes. Kontrollér, at serveren kan starte, at projektet er bygget, og at Edge er installeret.'
  if ($_.Exception.Message -match '^(Assistenten er stadig|Flere assistentvinduer|Microsoft Edge blev|Assistentvinduet blev)') { $message = $_.Exception.Message }
  if (-not $NoErrorDialog) {
    Add-Type -AssemblyName System.Windows.Forms
    $null = [System.Windows.Forms.MessageBox]::Show($message, 'MAK Sigma-assistent')
  }
  Write-Error $message
  exit 1
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}



