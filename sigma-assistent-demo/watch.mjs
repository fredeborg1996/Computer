import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const root = import.meta.dirname;
const data = path.join(root, "data");
fs.mkdirSync(data, { recursive: true });
const lock = path.join(data, "watch.pid");
try {
  const pid = Number(fs.readFileSync(lock, "utf8"));
  if (pid > 0) {
    process.kill(pid, 0);
    process.exit(0);
  }
} catch {}
fs.writeFileSync(lock, String(process.pid));
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
  if(process.env.SIGMA_LIVE_BRIDGE !== '0' && (!liveBridge || liveBridge.exitCode !== null) && fs.existsSync(executable)) {
    liveBridge=spawn(executable,[],{cwd:root,windowsHide:true,stdio:'ignore'});
    liveBridge.on('error',()=>{liveBridge=null;});
  }
  try {
    const r = await fetch("http://127.0.0.1:4317/api/state", {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw Error("Server not ready");
  } catch {
    const log = fs.openSync(path.join(root, "server.log"), "a");
    const err = fs.openSync(path.join(root, "server-error.log"), "a");
    const child = spawn(process.execPath, [path.join(root, "server.mjs")], {
      cwd: root,
      windowsHide: true,
      detached: true,
      stdio: ["ignore", log, err],
    });
    child.unref();
    fs.closeSync(log);
    fs.closeSync(err);
  } finally {
    checking = false;
  }
}
await check();
setInterval(check, 30000);
