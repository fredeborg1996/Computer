$ErrorActionPreference = 'Stop'
# This helper runs in its own hidden process. Startup must never open a browser,
# start the legacy watcher, or trigger an automatic model review.
$taskPreviousAutoReview = $env:SIGMA_AUTOREVIEW
try {
  $env:SIGMA_AUTOREVIEW = '0'
  & (Join-Path $PSScriptRoot 'Start-Demo.ps1') -NoBrowser -NoWatch -Port 4317
} catch {
  # Start-Demo reports local startup/port errors, never request credentials.
  $_.Exception.Message | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'SigmaAI-server-start-error.log') -Encoding utf8
  exit 1
} finally {
  $env:SIGMA_AUTOREVIEW = $taskPreviousAutoReview
}
