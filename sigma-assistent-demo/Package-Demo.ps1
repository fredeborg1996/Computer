$ErrorActionPreference='Stop'
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$dest=Join-Path $PSScriptRoot ('packages\MAK-Sigma-demo-'+$stamp)
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$include=@('dist','server.mjs','engine.mjs','context.mjs','grounding.mjs','providers.mjs','ProviderPanel.jsx','SigmaConnection.jsx','HistoryPanel.jsx','ChatPanel.jsx','conversation.mjs','case-profile.mjs','case-documents.mjs','discover-documents.py','CaseDocumentsPanel.jsx','history.mjs','index-history.py','sigma-snapshot.mjs','sigma-file-watch.mjs','read-sigma.py','SigmaLiveBridge.cs','SigmaLiveBridge.exe','Build-LiveBridge.ps1','Start-LiveBridge.vbs','Open-SigmaPanel.vbs','INSTALLATION.md','watch.mjs','Start-Watch.vbs','Open-Demo.vbs','Start-Demo.ps1','Start-SigmaPanel.ps1','Sigma-MAK.AppScript.pas','Import-Pdf.ps1','import-pdf.py','README.md','QA.md','package.json','package-lock.json','src.jsx','style.css','index.html','test-discovery.py','test.mjs','test-api.mjs','AGENTS.md')
foreach($name in $include){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $dest -Recurse}
$zip=$dest+'.zip'
Compress-Archive -Path (Join-Path $dest '*') -DestinationPath $zip
Write-Output $zip
