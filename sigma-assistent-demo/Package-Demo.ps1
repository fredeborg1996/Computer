$ErrorActionPreference='Stop'
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$dest=Join-Path $PSScriptRoot ('packages\MAK-Sigma-demo-'+$stamp)
New-Item -ItemType Directory -Path $dest -Force | Out-Null
# Explicit code-only allowlist. Never include data, logs, tokens or Sigma binaries.
$include=@('dist','package.json','package-lock.json','index.html','style.css','README.md','INSTALLATION.md','AGENTS.md','Sigma-Native-AI.pas','Sigma-MAK.AppScript.pas','SigmaLiveBridge.cs','Build-LiveBridge.ps1','Build-SigmaAI-Package.ps1','Start-Demo.ps1','Start-SigmaAI-Server.ps1','Start-SigmaPanel.ps1','Open-Demo.vbs','Open-SigmaPanel.vbs','Start-LiveBridge.vbs','Start-Watch.vbs','Start-SigmaAI-Server.vbs','read-sigma.py','import-pdf.py','index-history.py','discover-documents.py','test-discovery.py','Import-Pdf.ps1','UX-UPDATE-20261023.txt')
$include+=@(Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object {$_.Extension -in '.mjs','.jsx'} | Select-Object -ExpandProperty Name)
foreach($name in $include){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $dest -Recurse}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'UX-UPDATE-20261023.txt') -Destination (Join-Path $dest 'QA.md')
$zip=$dest+'.zip'
Compress-Archive -Path (Join-Path $dest '*') -DestinationPath $zip
Write-Output $zip
