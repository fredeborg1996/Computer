param([Parameter(Mandatory=$true)][string]$Pdf,[string]$Pages='', [string]$Output='')
$ErrorActionPreference='Stop'
if (-not $Output) {$Output=Join-Path $PSScriptRoot 'data\dokumentuddrag.json'}
$python=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $python)) {$python='python'}
& $python (Join-Path $PSScriptRoot 'import-pdf.py') $Pdf --output $Output --pages $Pages
