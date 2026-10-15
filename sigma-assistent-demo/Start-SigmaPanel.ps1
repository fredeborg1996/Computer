$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'Start-Demo.ps1') -NoBrowser
$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edge)) {$edge=Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'}
if (Test-Path -LiteralPath $edge) {
  Add-Type -AssemblyName System.Windows.Forms
  $area=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $panelLeft=[Math]::Max($area.Left,$area.Right-460)
  Start-Process -FilePath $edge -ArgumentList @('--app=http://127.0.0.1:4317/?panel=1',"--window-size=460,$($area.Height)","--window-position=$panelLeft,$($area.Top)")
} else {Start-Process 'http://127.0.0.1:4317/?panel=1'}
