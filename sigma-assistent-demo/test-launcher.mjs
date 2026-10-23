// No real Sigma, Edge, history or model is opened by these launcher regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';

const run = (file, args = [], env = {}) => new Promise((resolve, reject) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-File', file, ...args], {
    windowsHide: true, env: { ...process.env, SIGMA_HISTORY_ROOT: '', ...env },
  });
  let output = '';
  child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
  child.on('error', reject); child.on('exit', code => resolve({ code, output }));
});
const availablePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});

test('parallel launcher starts reuse one isolated server on the explicit port', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mak-launcher-'));
  const port = await availablePort();
  let pid;
  try {
    await copyFile(new URL('./Start-Demo.ps1', import.meta.url), path.join(root, 'Start-Demo.ps1'));
    await mkdir(path.join(root, 'dist'));
    await writeFile(path.join(root, 'dist', 'index.html'), 'synthetic');
    await writeFile(path.join(root, 'server.mjs'), `import http from 'node:http'; import fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(path.join(root, 'starts'))}, process.pid+'\\n'); http.createServer((q,s)=>{s.setHeader('Content-Type','application/json');s.end(JSON.stringify({installed:false,model:'synthetic'}));}).listen(Number(process.env.PORT),'127.0.0.1');`);
    const results = await Promise.all(Array.from({ length: 3 }, () => run(path.join(root, 'Start-Demo.ps1'), ['-NoBrowser', '-Port', String(port)], { SIGMA_DATA_DIR: root, PORT: '1' })));
    const starts = (await readFile(path.join(root, 'starts'), 'utf8')).trim().split('\n');
    pid = Number(starts[0]);
    assert.equal(starts.length, 1, 'concurrent starts must create exactly one process');
    for (const result of results) assert.equal(result.code, 0, result.output);
  } finally {
    if (pid) { try { process.kill(pid); } catch {} }
    await new Promise(resolve => setTimeout(resolve, 200));
    await rm(root, { recursive: true, force: true });
  }
});

test('occupied unhealthy port fails without starting another server', { skip: process.platform !== 'win32' }, async () => {
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await run(new URL('./Start-Demo.ps1', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), ['-NoBrowser', '-Port', String(server.address().port)]);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /Ingen ny server er startet/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('panel status discovers actual windows without launching anything', { skip: process.platform !== 'win32' }, async () => {
  const port = await availablePort();
  const result = await run(new URL('./Start-SigmaPanel.ps1', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), ['-Action', 'Status', '-Port', String(port), '-NoErrorDialog']);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(JSON.parse(result.output), { port, windows: [] });
});

