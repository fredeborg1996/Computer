import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const bundledPython = path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');

export function createSigmaWatch(root, data, accept) {
  const settings = path.join(data, 'sigma-watch.json');
  let filename = '', hash = '', busy = false, generation = 0;
  let status = { enabled: false, error: '', lastRead: null, source: 'Kun gemte ændringer. Liveændringer kræver AppScript i Sigma.' };
  try { filename = JSON.parse(fs.readFileSync(settings)).filename || ''; status.enabled = !!filename; } catch {}
  async function tick() {
    if (!filename || busy) return;
    busy = true;
    const current = generation, target = filename;
    try {
      const stat = fs.statSync(target);
      if (stat.size > 32*1024*1024) throw Error('Sigma-filen er større end 32 MB.');
      const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      if (digest === hash) return;
      const { stdout } = await execute(process.env.SIGMA_PYTHON || (fs.existsSync(bundledPython) ? bundledPython : 'python.exe'), [path.join(root,'read-sigma.py'), target], { windowsHide:true, timeout:15000, maxBuffer:2*1024*1024, encoding:'utf8' });
      if (generation !== current || filename !== target) return;
      const snapshot = JSON.parse(stdout);
      if (snapshot.sourceHash !== digest) throw Error('Filen ændrede sig under læsningen. Prøver igen.');
      accept(snapshot);
      hash = digest;
      status = { ...status, error:'', lastRead:new Date().toISOString() };
    } catch(error) {
      if (generation === current) status.error = (error.stderr || error.message).slice(0,700);
    } finally { busy = false; }
  }
  const interval = setInterval(tick,2000); interval.unref();
  queueMicrotask(tick);
  return {
    info: () => ({ ...status, filename, busy }),
    configure(value) {
      if (typeof value !== 'string' || value.length > 2000 || (value && (!path.isAbsolute(value) || !/\.(sig|sit)$/i.test(value)))) throw Error('Vælg en absolut sti til .sig eller .sit.');
      if (value && !fs.statSync(value).isFile()) throw Error('Sigma-filen findes ikke.');
      filename = value; generation++; hash = ''; status = {...status, enabled:!!value, error:'', lastRead:null};
      fs.writeFileSync(settings, JSON.stringify({filename}));
      void tick();
      return this.info();
    },
    close: () => clearInterval(interval),
  };
}
