param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$healthy=$false
try {$null=Invoke-RestMethod 'http://127.0.0.1:4317/api/health' -TimeoutSec 3;$healthy=$true} catch {}
if (-not $healthy) {
  $node=(Get-Command node -ErrorAction Stop).Source
  if (-not (Test-Path (Join-Path $PSScriptRoot 'dist\index.html'))) {throw 'Kør npm install og npm run build i projektmappen først.'}
  Start-Process -FilePath $node -ArgumentList ('"'+(Join-Path $PSScriptRoot 'server.mjs')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log')
}
if (-not $NoBrowser) {Start-Process 'http://127.0.0.1:4317'}
