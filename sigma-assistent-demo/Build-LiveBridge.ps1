$ErrorActionPreference='Stop'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw '.NET Framework C# compiler mangler.'}
& $compiler /nologo /target:exe /platform:x86 /r:System.Web.Extensions.dll ('/out:'+(Join-Path $PSScriptRoot 'SigmaLiveBridge.exe')) (Join-Path $PSScriptRoot 'SigmaLiveBridge.cs')
if($LASTEXITCODE -ne 0){throw 'Live bridge kunne ikke kompileres.'}
