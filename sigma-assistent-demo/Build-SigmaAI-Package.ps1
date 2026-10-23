param(
  [string]$BundlePath = (Join-Path $PSScriptRoot 'Sigma-AI.sigmabundle'),
  [string]$OutputPath = (Join-Path $PSScriptRoot 'Sigma-AI.sigmapackage'),
  [ValidatePattern('^\d+\.\d+\.\d+\.\d+$')][string]$Version = '1.0.1.0'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $BundlePath -PathType Leaf)) {
  throw 'Byg først Sigma-AI.sigmabundle i Sigmas AppScript-editor: Tools > Create add-in bundle.'
}
$bundle = Get-Item -LiteralPath $BundlePath
if ($bundle.Extension -ne '.sigmabundle' -or $bundle.Length -eq 0) {
  throw 'Kilden skal være en ikke-tom .sigmabundle bygget af Sigma.'
}
$output = [IO.Path]::GetFullPath($OutputPath)
if ([IO.Path]::GetExtension($output) -ne '.sigmapackage') {
  throw 'Output skal have filtypen .sigmapackage.'
}
if (Test-Path -LiteralPath $output) {
  throw 'Pakken findes allerede. Vælg et nyt OutputPath for at bevare den tidligere pakke.'
}
# Only this compiled bundle is packaged. No server data, credentials, source
# folders, shell commands or restart actions are included.
$manifest = @'
<?xml version="1.0" encoding="utf-8"?>
<sigma.package.manifest>
  <id>5f388ac8-5885-44e8-9fb5-c668fc35f234</id>
  <name>Sigma AI</name>
  <version>PACKAGE_VERSION</version>
  <description>Native Sigma AI-panel under Værktøjer. Kræver den lokale server i C:\MAK-Sigma.</description>
  <productId>SigmaAI.Local</productId>
  <type>1</type>
  <backup>true</backup>
  <actions>
    <action type="copy">
      <source>Sigma-AI.sigmabundle</source>
      <target>Sigma-AI.sigmabundle</target>
      <replace>yes</replace>
      <backup>true</backup>
    </action>
  </actions>
</sigma.package.manifest>
'@
$manifest = $manifest.Replace('PACKAGE_VERSION', $Version)
Add-Type -AssemblyName System.IO.Compression
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew)
try {
  $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
  try {
    $entry = $archive.CreateEntry('install.xml')
    $writer = New-Object IO.StreamWriter($entry.Open(), (New-Object Text.UTF8Encoding($false)))
    try { $writer.Write($manifest) } finally { $writer.Dispose() }
    $entry = $archive.CreateEntry('Sigma-AI.sigmabundle')
    $target = $entry.Open()
    $source = [IO.File]::OpenRead($bundle.FullName)
    try { $source.CopyTo($target) } finally { $source.Dispose(); $target.Dispose() }
  } finally { $archive.Dispose() }
} finally { $stream.Dispose() }
Write-Output ('Installationspakke klar: ' + $output)
Write-Output ('SHA-256: ' + (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash)
Write-Output 'Pakken er kun bygget. Den er ikke installeret, og Sigma er ikke genstartet.'
