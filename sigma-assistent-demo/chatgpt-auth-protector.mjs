import { spawn } from 'node:child_process';

const entropy = Buffer.from('MAK-Sigma ChatGPT credentials v1').toString('base64');
function hiddenPowerShell(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output = '', size = 0;
    const timer = setTimeout(() => { child.kill(); reject(Error('Windows credential protection timed out.')); }, 10000);
    child.stdout.on('data', chunk => { size += chunk.length; if(size > 3000000) child.kill(); else output += chunk; });
    // Never forward PowerShell errors: a framework exception could quote its input.
    child.stderr.resume();
    child.once('error', () => { clearTimeout(timer); reject(Error('Windows credential protection could not start.')); });
    child.once('close', code => { clearTimeout(timer); code === 0 && size <= 3000000 ? resolve(output.trim()) : reject(Error('Windows credential protection failed.')); });
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export function createWindowsProtector() {
  async function run(operation, bytes) {
    if(process.platform !== 'win32')throw Error('Protected ChatGPT credentials require Windows DPAPI on this installation.');
    const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; try { $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Convert]::FromBase64String('${entropy}'); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result)) } catch { exit 1 }`;
    return Buffer.from(await hiddenPowerShell(script,Buffer.from(bytes).toString('base64')),'base64');
  }
  return {protect:plain=>run('Protect',Buffer.from(plain,'utf8')),unprotect:async cipher=>(await run('Unprotect',cipher)).toString('utf8')};
}
export async function openChatGPTBrowser(url) {
  const parsed = new URL(url);
  if(parsed.origin !== 'https://auth.openai.com' || parsed.pathname !== '/api/accounts/authorize')throw Error('Unexpected ChatGPT authorization destination.');
  if(process.platform !== 'win32')throw Error('Open the ChatGPT authorization flow using the system browser on Windows.');
  // URL (which can contain an ID-token hint) is stdin, never a shell expression or argv.
  await hiddenPowerShell("$ErrorActionPreference='Stop';try{$url=[Console]::In.ReadToEnd();$uri=[Uri]$url;if($uri.Scheme -ne 'https' -or $uri.Host -ne 'auth.openai.com' -or $uri.AbsolutePath -ne '/api/accounts/authorize'){exit 1};Start-Process -FilePath $url}catch{exit 1}",url);
}
