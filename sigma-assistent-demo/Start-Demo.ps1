param([switch]$NoBrowser, [switch]$NoWatch, [ValidateRange(1024,65535)][int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 4317 }))
$ErrorActionPreference='Stop'
$mutex = New-Object System.Threading.Mutex($false, "Local\MAK-Sigma-Server-$Port")
$locked = $false
function Test-Server {
  try {
    $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
    return ($null -ne $health.PSObject.Properties['installed'] -and $null -ne $health.PSObject.Properties['model'])
  } catch { return $false }
}
try {
  try { $locked = $mutex.WaitOne(30000) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { throw 'Serverstart er allerede i gang.' }
  if (-not (Test-Server)) {
    # An occupied port with invalid health is an error, not permission to spawn another server.
    $probe = New-Object System.Net.Sockets.TcpClient
    $occupied = $false
    try { $probe.Connect('127.0.0.1', $Port); $occupied = $true } catch {} finally { $probe.Dispose() }
    if ($occupied) { throw 'Porten er optaget, men assistentens server svarer ikke korrekt. Ingen ny server er startet.' }
    $node=(Get-Command node -ErrorAction Stop).Source
    if (-not (Test-Path (Join-Path $PSScriptRoot 'dist\index.html'))) { throw 'Kør npm install og npm run build i projektmappen først.' }
    $previousPort = $env:PORT
    try {
      $env:PORT = "$Port"
      $server = Start-Process -FilePath $node -ArgumentList ('"'+(Join-Path $PSScriptRoot 'server.mjs')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot "server-$Port.log") -RedirectStandardError (Join-Path $PSScriptRoot "server-$Port-error.log") -PassThru
    } finally { $env:PORT = $previousPort }
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
      Start-Sleep -Milliseconds 250
      $ready = Test-Server
      $server.Refresh()
    } while (-not $ready -and -not $server.HasExited -and [DateTime]::UtcNow -lt $deadline)
    if (-not $ready) {
      if (-not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
      throw 'Assistentens server kunne ikke starte. Se den lokale serverlog.'
    }
  }
  # Production starts the read-only live watcher; isolated fixtures must opt in.
  $watchEnabled = -not $NoWatch -and ($env:SIGMA_LIVE_BRIDGE -eq '1' -or (-not $env:SIGMA_DATA_DIR -and $env:SIGMA_LIVE_BRIDGE -ne '0'))
  $watchScript = Join-Path $PSScriptRoot 'watch.mjs'
  if ($watchEnabled -and (Test-Path -LiteralPath $watchScript)) {
    $dataRoot = if ($env:SIGMA_DATA_DIR) { $env:SIGMA_DATA_DIR } else { Join-Path $PSScriptRoot 'data' }
    $watchLock = Join-Path $dataRoot "watch-$Port.pid"
    $watchRunning = $false
    if (Test-Path -LiteralPath $watchLock) {
      $watchProcessId = 0
      if ([int]::TryParse((Get-Content -LiteralPath $watchLock -Raw).Trim(), [ref]$watchProcessId)) {
        $existingWatch = Get-CimInstance Win32_Process -Filter "ProcessId=$watchProcessId" -ErrorAction SilentlyContinue
        $watchRunning = $existingWatch -and $existingWatch.CommandLine -and $existingWatch.CommandLine.IndexOf($watchScript, [StringComparison]::OrdinalIgnoreCase) -ge 0
      }
    }
    if (-not $watchRunning) {
      $previousPort = $env:PORT
      try {
        $env:PORT = "$Port"
        $node = (Get-Command node -ErrorAction Stop).Source
        Start-Process -FilePath $node -ArgumentList ('"'+$watchScript+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
      } finally { $env:PORT = $previousPort }
    }
  }
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port" }



