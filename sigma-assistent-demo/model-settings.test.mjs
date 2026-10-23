import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createModelSettings } from './model-settings.mjs';
import { cloudAsk } from './providers.mjs';

function fixture(t, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigma-model-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, settings: createModelSettings(dir, env) };
}
test('legacy installation needs explicit choice; choices survive restart and change', t => {
  const { dir, settings } = fixture(t);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ autoEnabled: true }));
  assert.equal(settings.get().confirmed, false);
  assert.throws(() => settings.requireLocal(), /Vælg og gem/);
  settings.save({ mode: 'local', model: 'qwen3.5:9b' });
  assert.equal(createModelSettings(dir, {}).requireLocal(), 'qwen3.5:9b');
  settings.save({ mode: 'cloud', provider: 'openai', model: 'chosen-cloud-model' });
  const restarted = createModelSettings(dir, {});
  assert.deepEqual(restarted.get(), { confirmed: true, mode: 'cloud', provider: 'openai', model: 'chosen-cloud-model' });
  assert.throws(() => restarted.requireLocal(), /forhåndsvisningen/);
  assert.equal(restarted.cloudEnvironment().SIGMA_OPENAI_MODEL, 'chosen-cloud-model');
  settings.save({ mode: 'local', model: 'other-local-model' });
  assert.equal(settings.requireLocal(), 'other-local-model');
});
test('invalid choices, corrupt state and local-only policy do not enable model', t => {
  const { dir, settings } = fixture(t, { SIGMA_LOCAL_ONLY: '1' });
  assert.throws(() => settings.save({ mode: 'cloud', provider: 'openai', model: 'model' }), /kun lokal/);
  assert.throws(() => settings.save({ mode: 'local', model: '' }), /modelnavn/);
  fs.writeFileSync(path.join(dir, 'model-settings.json'), '{broken');
  assert.equal(createModelSettings(dir, {}).get().confirmed, false);
});

test('ChatGPT login is an explicit persisted OpenAI connection, never an implicit API fallback', t => {
  const {dir,settings}=fixture(t);
  settings.save({mode:'cloud',provider:'openai',model:'account-model',auth:'chatgpt'});
  assert.equal(createModelSettings(dir,{}).get().auth,'chatgpt');
  assert.throws(()=>settings.save({mode:'cloud',provider:'anthropic',model:'model',auth:'chatgpt'}),/ChatGPT-login kræver OpenAI/);
  assert.throws(()=>settings.save({mode:'cloud',provider:'openai',model:'model',auth:'unknown'}),/forbindelsestype/);
  settings.save({mode:'local',model:'qwen3.5:9b'});
  assert.equal(settings.get().auth,undefined);
});
test('saved selection routes exact model to cloud adapter without exposing secret or fallback', async t => {
  const env = { OPENAI_API_KEY: 'synthetic-secret', SIGMA_OPENAI_MODEL: 'wrong-env-model' };
  const { dir, settings } = fixture(t, env);
  settings.save({ mode: 'cloud', provider: 'openai', model: 'explicit-model' });
  let calls = 0;
  const request = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(JSON.parse(options.body).model, 'explicit-model');
    return { ok: false, status: 429 };
  };
  await assert.rejects(cloudAsk('openai', {}, settings.cloudEnvironment(), request), /429/);
  assert.equal(calls, 1);
  assert(!fs.readFileSync(path.join(dir, 'model-settings.json'), 'utf8').includes('synthetic-secret'));
  const missing = fixture(t).settings;
  missing.save({ mode: 'cloud', provider: 'anthropic', model: 'explicit-claude' });
  await assert.rejects(cloudAsk('anthropic', {}, missing.cloudEnvironment(), request), /ikke tilkoblet/);
  assert.equal(calls, 1);
});
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import net from 'node:net';

test('isolated API startup, local execution, unavailable model, cloud guard and restart', async t => {
  const { dir } = fixture(t);
  const capture = path.join(dir, 'requests.json');
  const preload = path.join(dir, 'mock-fetch.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs';
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/api/tags')) return Response.json({ models: [{name:'controlled-local'}] });
      if (String(url).endsWith('/api/chat')) {
        const body=JSON.parse(options.body); fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify(body));
        if(body.model !== 'controlled-local') return new Response('',{status:404});
        return Response.json({message:{content:JSON.stringify({answer:'Kontrolleret lokalt svar. Uafklaret grundlag.',sources:[]})}});
      }
      throw Error('Unexpected outbound request blocked by test');
    };`);
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  let child;
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const closed = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await closed;
  };
  t.after(stop);
  async function start() {
    child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'server.mjs'], {
      cwd: import.meta.dirname, windowsHide: true,
      env: { ...process.env, PORT: String(port), SIGMA_DATA_DIR: dir, SIGMA_HISTORY_ROOT: '', SIGMA_AUTOREVIEW: '1', SIGMA_LOCAL_ONLY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(Error('Server exited '+code))); setTimeout(() => reject(Error('Startup timeout')), 5000).unref(); });
  }
  async function call(endpoint, value) {
    const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, value ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(value) } : {});
    return { status: response.status, body: await response.json() };
  }
  await start();
  const state = (await call('/api/state')).body.state;
  assert.equal((await call('/api/health')).body.modelSettings.confirmed, false);
  assert.equal((await call('/api/chat', {question:'Test',revision:state.revision})).status, 409);
  await new Promise(resolve => setTimeout(resolve, 3800));
  assert(!fs.existsSync(capture), 'Unconfirmed startup must not trigger automatic model calls');
  await call('/api/model/settings', {mode:'local',model:'controlled-local'});
  assert.equal((await call('/api/health')).body.configured, true);
  assert.equal((await call('/api/chat', {question:'Test',revision:state.revision})).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(capture)).model, 'controlled-local');
  await stop(); await start();
  assert.equal((await call('/api/health')).body.modelSettings.model, 'controlled-local');
  await call('/api/model/settings', {mode:'local',model:'missing-local'});
  assert.equal((await call('/api/health')).body.configured, false);
  assert.equal((await call('/api/chat', {question:'Test',revision:state.revision})).status, 500);
  await call('/api/model/settings', {mode:'cloud',provider:'openai',model:'explicit-cloud'});
  assert.equal((await call('/api/health')).body.configured, false);
  assert.equal((await call('/api/chat', {question:'Test',revision:state.revision})).status, 409);
  assert.equal(JSON.parse(fs.readFileSync(capture)).model, 'missing-local');
  await stop(); await start();
  assert.equal((await call('/api/health')).body.modelSettings.mode, 'cloud');
});
import { liveBridgeInfo } from './live-bridge-status.mjs';

test('live COM status reports missing, waiting and stale states honestly', t => {
  const { dir } = fixture(t);
  const now = Date.now();
  assert.equal(liveBridgeInfo(dir, now).status, 'unavailable');
  const filename = path.join(dir, 'sigma-live-status.json');
  fs.writeFileSync(filename, JSON.stringify({status:'waiting',message:'MK_E_UNAVAILABLE',time:new Date(now).toISOString(),runtimeValidated:false}));
  assert.equal(liveBridgeInfo(dir, now).message, 'MK_E_UNAVAILABLE');
  assert.equal(liveBridgeInfo(dir, now).status, 'waiting');
  assert.equal(liveBridgeInfo(dir, now + 11000).status, 'disconnected');
  fs.writeFileSync(filename, JSON.stringify({status:'connected',message:'Snapshot sent',time:new Date(now).toISOString(),runtimeValidated:false}));
  assert.equal(liveBridgeInfo(dir, now).status, 'connected');
  assert.equal(liveBridgeInfo(dir, now).runtimeValidated, false);
  fs.writeFileSync(filename, '{broken');
  assert.equal(liveBridgeInfo(dir, now).status, 'unavailable');
});
