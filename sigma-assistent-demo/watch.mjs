import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const root = import.meta.dirname;
const data = process.env.SIGMA_DATA_DIR || path.join(root, "data");
const port = Number(process.env.PORT || 4317);
const bridgeEnabled = process.env.SIGMA_LIVE_BRIDGE === '1' || (!process.env.SIGMA_DATA_DIR && process.env.SIGMA_LIVE_BRIDGE !== '0');
fs.mkdirSync(data, { recursive: true });
const lock = path.join(data, "watch-" + port + ".pid");
// Exclusive creation prevents two simultaneous launchers from becoming watchers.
for (let attempt=0; attempt<3; attempt++) {
  try { const fd=fs.openSync(lock,'wx'); fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);break; }
  catch(e) {
    if(e.code!=='EEXIST')throw e;
    let pid=0;try{pid=Number(fs.readFileSync(lock,'utf8'));}catch{}
    if(!pid)process.exit(0); // Another process may still be writing its new lock.
    try{process.kill(pid,0);process.exit(0);}catch{}
    try{fs.unlinkSync(lock);}catch{}
    if(attempt===2)process.exit(0);
  }
}
process.on("exit", () => {
  try {
    if (fs.readFileSync(lock, "utf8") === String(process.pid))
      fs.unlinkSync(lock);
  } catch {}
});
let checking = false;
let liveBridge;
async function check() {
  if (checking) return;
  checking = true;
  const executable=path.join(root,'SigmaLiveBridge.exe');
  if(bridgeEnabled && (!liveBridge || liveBridge.exitCode !== null) && fs.existsSync(executable)) {
    liveBridge=spawn(executable,[],{cwd:root,windowsHide:true,stdio:'ignore'});
    liveBridge.on('error',()=>{liveBridge=null;});
  }
  try {
    const r = await fetch("http://127.0.0.1:" + port + "/api/state", {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw Error("Server not ready");
  } catch {
    const child = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'Start-Demo.ps1'),'-NoBrowser','-NoWatch','-Port',String(port)], {cwd:root,windowsHide:true,stdio:'ignore'});
    await new Promise(resolve=>{child.once('error',resolve);child.once('exit',resolve);});
  } finally {
    checking = false;
  }
}
await check();
setInterval(check, 30000);

