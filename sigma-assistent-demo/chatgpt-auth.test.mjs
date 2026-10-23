import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createChatGPTConnection, consumeResponse } from './chatgpt-auth.mjs';
import { createWindowsProtector } from './chatgpt-auth-protector.mjs';

const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'synthetic-key',alg:'RS256',use:'sig'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const sse=events=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
const completed=()=>sse([{type:'response.output_text.delta',delta:'Kontrolleret '},{type:'response.output_text.delta',delta:'syntetisk svar'},{type:'response.completed',response:{status:'completed'}}]);
async function fixture(t,config={}){
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'sigma-chatgpt-auth-'));
  let clock=Date.now(),urls=[],calls=[],refreshes=0,revocations=0;
  const key=crypto.randomBytes(32);
  const protector={protect:async plain=>{const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);const bytes=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),bytes]);},unprotect:async bytes=>{const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}};
  const env={};
  async function jwt(options={}){
    return new SignJWT({nonce:options.nonce??new URL(urls.at(-1)).searchParams.get('nonce'),email:'synthetic@example.invalid'})
      .setProtectedHeader({alg:'RS256',kid:'synthetic-key'}).setIssuer(options.issuer||'https://auth.openai.com').setAudience(options.audience||'oaiapp_synthetic').setSubject(options.subject||'synthetic-subject').setIssuedAt(Math.floor(clock/1000)).setExpirationTime(options.expiration??Math.floor(clock/1000)+3600).sign(options.privateKey||privateKey);
  }
  async function request(url,options={}){
    const target=String(url);calls.push({url:target,options});
    if(target==='https://auth.openai.com/.well-known/jwks.json')return Response.json({keys:[jwk]});
    if(target==='https://auth.openai.com/api/accounts/oauth/token'){
      const form=new URLSearchParams(options.body);
      if(config.tokenFailure&&form.get('grant_type')==='authorization_code')return Response.json({error:config.tokenFailure},{status:400});
      if(form.get('grant_type')==='refresh_token'){
        refreshes++;assert.equal(form.get('client_id'),'oaiapp_synthetic');assert.equal(form.has('scope'),false);
        if(config.refreshFailure)return Response.json({error:config.refreshFailure},{status:400});
        await new Promise(resolve=>setTimeout(resolve,20));
        return Response.json({access_token:'synthetic-access-refreshed',refresh_token:'synthetic-refresh-rotated',token_type:'Bearer',expires_in:3600,...(config.refreshScope!==undefined?{scope:config.refreshScope}:{})});
      }
      assert.equal(form.get('client_id'),'oaiapp_synthetic');assert.equal(form.get('resource'),'https://api.openai.com/v1');
      assert.equal(form.get('redirect_uri'),new URL(urls.at(-1)).searchParams.get('redirect_uri'));
      const digest=crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url');assert.equal(digest,new URL(urls.at(-1)).searchParams.get('code_challenge'));
      const saved=JSON.parse(await protector.unprotect(await fs.readFile(path.join(data,'chatgpt-connection','credentials.dpapi'))));
      assert(saved.records.some(r=>r.client_id==='oaiapp_synthetic'),'issued client retained before token exchange');
      return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',id_token:await jwt(config.identity||{}),token_type:'Bearer',expires_in:120,scope:config.scope??'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'});
    }
    if(target==='https://api.openai.com/v1/models')return Response.json({models:[{slug:'actual-catalog-slug',display_name:'Synthetic Model',visibility:'list'},{slug:'hidden',display_name:'Hidden',visibility:'hide'}]});
    if(target==='https://api.openai.com/v1/responses'){
      assert(options.headers.Authorization.startsWith('Bearer synthetic-access'));
      const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.model,'actual-catalog-slug');
      assert(Array.isArray(body.input),'ChatGPT plan endpoint requires input items, not a string');
      assert.equal(body.input[0].role,'user');assert.equal(body.input[0].content[0].type,'input_text');
      assert.equal(typeof JSON.parse(body.input[0].content[0].text),'object');
      return config.inference?config.inference(options):completed();
    }
    if(target==='https://auth.openai.com/.well-known/openid-configuration')return Response.json({revocation_endpoint:'https://auth.openai.com/api/accounts/oauth/revoke'});
    if(target==='https://auth.openai.com/api/accounts/oauth/revoke'){revocations++;if(config.revocationWait)await config.revocationWait;return config.revokeFailure?new Response('',{status:503}):new Response('',{status:200});}
    throw Error('Test blocked unexpected network destination');
  }
  const options={data,env,request,protector,now:()=>clock,openBrowser:url=>urls.push(url),authorizationTimeoutMs:3000};
  const connection=createChatGPTConnection(options);
  await connection.ready();
  t.after(async()=>{await connection.disconnect();await fs.rm(data,{recursive:true,force:true});});
  async function login({state,issued='oaiapp_synthetic',code='synthetic-code',oauthError}={}){
    await connection.startLogin();await tick();
    const authorize=new URL(urls.at(-1)),callback=new URL(authorize.searchParams.get('redirect_uri'));
    callback.searchParams.set('state',state??authorize.searchParams.get('state'));
    if(issued!==null)callback.searchParams.set('client_id',issued);
    if(oauthError)callback.searchParams.set('error',oauthError);else callback.searchParams.set('code',code);
    const result=await fetch(callback);await result.text();await tick();return result;
  }
  async function waitModels(){for(let i=0;i<20&&!connection.getStatus().models.length;i++)await tick();}
  return {data,env,connection,options,login,waitModels,calls,urls,config,advance:ms=>clock+=ms,refreshes:()=>refreshes,revocations:()=>revocations,readStore:async()=>JSON.parse(await protector.unprotect(await fs.readFile(path.join(data,'chatgpt-connection','credentials.dpapi'))))};
}

test('OAuth validates PKCE/JWT, protects tokens, streams exact catalog slug and resumes after restart',async t=>{
  const f=await fixture(t);
  assert.equal(f.calls.length,0,'initialization must not contact network');
  assert.equal((await f.login()).status,200);await f.waitModels();
  const auth=new URL(f.urls[0]);assert.equal(auth.origin,'https://auth.openai.com');assert.equal(auth.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(auth.searchParams.get('agent_name_hint'),'Sigma AI');
  assert.match(auth.searchParams.get('ext_agent_host_id'),/^urn:uuid:/);assert.equal(new URL(auth.searchParams.get('redirect_uri')).pathname,'/auth/callback');
  const status=f.connection.getStatus();assert.equal(status.connected,true);assert.equal(status.sharing,true);assert(status.accountId);
  assert.deepEqual(status.models,[{slug:'actual-catalog-slug',display_name:'Synthetic Model'}]);
  assert(!JSON.stringify(status).includes('synthetic-access'));assert(!JSON.stringify(status).includes('synthetic-refresh'));assert(!JSON.stringify(status).includes('synthetic@example'));
  const encrypted=await fs.readFile(path.join(f.data,'chatgpt-connection','credentials.dpapi'));assert(!encrypted.includes(Buffer.from('synthetic-access')));
  assert.equal(await f.connection.ask('actual-catalog-slug',{question:'Only synthetic material'},'Return JSON'),'Kontrolleret syntetisk svar');
  await assert.rejects(f.connection.ask('invented-model',{},''),/modelkatalog/);
  const restarted=createChatGPTConnection(f.options);await restarted.ready();assert.equal(restarted.getStatus().accountId,status.accountId);assert.equal(restarted.getStatus().connected,true);await restarted.listModels();
  await f.connection.disconnect();assert.equal(f.connection.getStatus().connected,false);assert.equal(f.revocations(),1);
  const saved=await f.readStore();assert.equal(saved.records[0].client_id,'oaiapp_synthetic');assert.equal(saved.records[0].access_token,undefined);
});

test('state mismatch never exchanges code; denial validates state and terminates attempt',async t=>{
  const f=await fixture(t);
  assert.equal((await f.login({state:'wrong-state'})).status,400);assert.equal(f.calls.length,0);assert.equal(f.connection.getStatus().status,'pending');
  assert.equal((await f.login({oauthError:'access_denied'})).status,400);assert.equal(f.calls.length,0);assert.equal(f.connection.getStatus().status,'error');
});

test('issued registration is retained before invalid_grant and reused on retry',async t=>{
  const f=await fixture(t,{tokenFailure:'invalid_grant'});
  assert.equal((await f.login()).status,400);assert.equal(f.connection.getStatus().connected,false);
  f.config.tokenFailure=null;
  assert.equal((await f.login()).status,200);
  const retry=new URL(f.urls.at(-1));assert.equal(retry.searchParams.get('client_id'),'oaiapp_synthetic');assert.equal(retry.searchParams.has('agent_name_hint'),false);
});

test('returning login retains host/client and verifies subject before credential replacement',async t=>{
  const f=await fixture(t);await f.login();await f.waitModels();
  const before=await f.readStore(),id=f.connection.getStatus().accountId;
  f.config.identity={subject:'another-account'};
  assert.equal((await f.login({issued:null})).status,400);
  const reauth=new URL(f.urls.at(-1));assert.equal(reauth.searchParams.get('client_id'),'oaiapp_synthetic');assert(reauth.searchParams.get('id_token_hint'));assert.equal(reauth.searchParams.get('ext_agent_host_id'),new URL(f.urls[0]).searchParams.get('ext_agent_host_id'));
  assert.equal(f.connection.getStatus().accountId,id);assert.equal((await f.readStore()).records[0].access_token,before.records[0].access_token);
});

test('wrong ID token nonce, issuer, audience, expiration or signature is rejected',async t=>{
  const other=await generateKeyPair('RS256');
  for(const identity of [{nonce:'wrong-nonce'},{issuer:'https://example.invalid'},{audience:'wrong-client'},{expiration:1},{privateKey:other.privateKey}]){
    await t.test(Object.keys(identity)[0],async child=>{const f=await fixture(child,{identity});assert.equal((await f.login()).status,400);assert.equal(f.connection.getStatus().connected,false);});
  }
});

test('missing direct grant and local-only policy cannot perform inference or start login',async t=>{
  const f=await fixture(t,{scope:'openid profile email'});await f.login();
  assert.equal(f.connection.getStatus().connected,true);assert.equal(f.connection.getStatus().sharing,false);
  await assert.rejects(f.connection.ask('actual-catalog-slug',{},''),/planbrug/);
  f.env.SIGMA_LOCAL_ONLY='1';const before=f.calls.length;
  await assert.rejects(f.connection.startLogin(),/kun lokal/);await assert.rejects(f.connection.ask('actual-catalog-slug',{},''),/kun lokal/);assert.equal(f.calls.length,before);
});

test('refresh is singleflight and rotating credentials persist across competing connections',async t=>{
  const f=await fixture(t);await f.login();await f.waitModels();
  const second=createChatGPTConnection(f.options);await second.ready();await second.listModels();f.advance(100000);
  const answers=await Promise.all([f.connection.ask('actual-catalog-slug',{},''),f.connection.ask('actual-catalog-slug',{},''),second.ask('actual-catalog-slug',{},'')]);
  assert.equal(answers.length,3);assert.equal(f.refreshes(),1);
  const record=(await f.readStore()).records[0];assert.equal(record.refresh_token,'synthetic-refresh-rotated');assert(record.scopes.includes('chatgpt.tokens.use.direct'));
});

test('refresh invalid_grant clears local tokens without fallback',async t=>{
  const f=await fixture(t,{refreshFailure:'invalid_grant'});await f.login();await f.waitModels();f.advance(100000);
  await assert.rejects(f.connection.ask('actual-catalog-slug',{},''),/invalid_grant/);
  assert.equal(f.connection.getStatus().connected,false);assert.equal(f.calls.filter(c=>c.url.endsWith('/responses')).length,0);
});

test('sign out clears tokens and reports unconfirmed remote revocation',async t=>{
  const f=await fixture(t,{revokeFailure:true});await f.login();await f.waitModels();
  const result=await f.connection.disconnect();assert.equal(result.connected,false);assert.match(result.error,/Fjernfrakobling/);assert.equal(f.revocations(),2);
});

test('Responses stream rejects failure, incomplete, interrupted and malformed streams',async()=>{
  for(const stream of [sse([{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}]),sse([{type:'response.incomplete'}]),sse([{type:'response.output_text.delta',delta:'partial'}]),sse([{type:'response.completed'}]),new Response('data: not-json\n\n')])await assert.rejects(consumeResponse(stream),/ChatGPT/);
  const bytes=new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"Dansk æøå"}\r\n\r\ndata: {"type":"response.completed","response":{"status":"completed"}}\r\n\r\n');
  const split=new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close();}});
  assert.equal(await consumeResponse(new Response(split)),'Dansk æøå');
});

test('disconnect immediately blocks new requests while remote revocation is pending',async t=>{
  const f=await fixture(t);await f.login();await f.waitModels();
  let release;
  f.config.revocationWait=new Promise(resolve=>release=resolve);
  const signingOut=f.connection.disconnect();
  try{
    await tick();
    assert.equal(f.connection.getStatus().connected,false);
    assert.equal(f.connection.getStatus().status,'disconnecting');
    await assert.rejects(f.connection.ask('actual-catalog-slug',{},''),/afbrudt/);
    await assert.rejects(f.connection.startLogin(),/afbrudt/);
    assert.equal(f.calls.filter(c=>c.url.endsWith('/responses')).length,0);
    for(let i=0;i<100&&!f.revocations();i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(f.revocations(),1,'remote revocation has started and is still delayed');
    const restarted=createChatGPTConnection(f.options);
    await restarted.ready();
    assert.equal(restarted.getStatus().connected,false,'persisted credentials are already removed before remote revocation finishes');
  }finally{release();await signingOut;}
  assert.equal(f.connection.getStatus().connected,false);
});

test('disconnect aborts an active response body after headers arrived',async t=>{
  let started;
  const began=new Promise(resolve=>started=resolve);
  const f=await fixture(t,{inference:options=>new Response(new ReadableStream({start(controller){
    controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'));
    options.signal.addEventListener('abort',()=>controller.error(Error('synthetic aborted stream')),{once:true});started();
  }}))});
  await f.login();await f.waitModels();
  const answer=f.connection.ask('actual-catalog-slug',{},'');
  const rejected=assert.rejects(answer,/afbrudt/);
  await began;await f.connection.disconnect();await rejected;
  assert.equal(f.connection.getStatus().connected,false);
});

test('Windows protector roundtrip keeps plaintext out of encrypted bytes',{skip:process.platform!=='win32'},async()=>{
  const protector=createWindowsProtector();const encrypted=await protector.protect('synthetic Windows DPAPI material');assert(!encrypted.includes(Buffer.from('synthetic Windows DPAPI material')));assert.equal(await protector.unprotect(encrypted),'synthetic Windows DPAPI material');
});
