import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { createWindowsProtector, openChatGPTBrowser } from './chatgpt-auth-protector.mjs';

const ISSUER = 'https://auth.openai.com';
const AUTHORIZE = ISSUER + '/api/accounts/authorize';
const TOKEN = ISSUER + '/api/accounts/oauth/token';
const JWKS = ISSUER + '/.well-known/jwks.json';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const DIRECT = 'chatgpt.tokens.use.direct';
const nonceValue = () => crypto.randomBytes(32).toString('base64url');
const equal = (a,b) => typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const accountId = record => crypto.createHash('sha256').update([ISSUER,record.subject||'',record.client_id].join('\n')).digest('hex').slice(0,32);
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const safeCode = value => typeof value==='string' && /^[a-z_]{1,90}$/.test(value) ? value : 'unknown_error';
const scopesOf = value => typeof value==='string' ? [...new Set(value.trim().split(/\s+/).filter(Boolean))] : [];

/** Own public OAuth client; does not read Codex, ChatGPT desktop or other apps' credentials. */
export function createChatGPTConnection({data,env=process.env,request=fetch,openBrowser=openChatGPTBrowser,protector=createWindowsProtector(),now=Date.now,authorizationTimeoutMs=300000}={}) {
  if(!data)throw Error('A private application data directory is required.');
  const directory=path.join(data,'chatgpt-connection');
  const filename=path.join(directory,'credentials.dpapi');
  const hostFile=path.join(directory,'host.json');
  const lockFile=path.join(directory,'session.lock');
  let store={version:1,active:null,records:[]};
  let host='',initialization,attempt=null,refreshFlight=null,catalogFlight=null,keySet=null,keyAge=0;
  let models=[],status='disconnected',error='',generation=0,disconnecting=false,disconnectFlight=null;
  const controllers=new Set();
  let sessionController=new AbortController();
  const policy=()=>{if(env.SIGMA_LOCAL_ONLY==='1')throw Error('Virksomhedspolitikken tillader kun lokal behandling.');};
  const active=()=>store.records.find(record=>record.id===store.active);
  const hasTokens=record=>!!(record?.access_token && record?.subject && record?.client_id);
  function getStatus() {
    const record=active();
    const connected=!disconnecting&&hasTokens(record);
    return {connected,sharing:connected&&record.scopes?.includes(DIRECT)===true,status:env.SIGMA_LOCAL_ONLY==='1'?'blocked':status,error:env.SIGMA_LOCAL_ONLY==='1'?'Virksomhedspolitikken tillader kun lokal behandling.':error,accountId:record?.id||null,connectionId:record?.id||null,models:models.map(m=>({...m})),accounts:store.records.filter(r=>r.subject).map((r,i)=>({id:r.id,label:'ChatGPT-konto '+(i+1),connected:hasTokens(r)}))};
  }
  function settleStatus() {
    const record=active();
    status=hasTokens(record)?record.scopes.includes(DIRECT)?'connected':'permission_required':'disconnected';
    error=hasTokens(record)&&!record.scopes.includes(DIRECT)?'ChatGPT-planbrug er ikke godkendt. Godkend forbindelsen igen i ChatGPT.':'';
  }
  async function readStore() {
    try {
      const bytes=await fs.readFile(filename);
      const parsed=JSON.parse(await protector.unprotect(bytes));
      if(parsed.version!==1||!Array.isArray(parsed.records)||parsed.records.length>50)throw Error('Invalid credential record.');
      for(const r of parsed.records)if(typeof r.client_id!=='string'||!r.client_id||r.client_id==='dynamic_agent_client'||!Array.isArray(r.scopes)||typeof r.id!=='string')throw Error('Invalid registration.');
      return parsed;
    }catch(e){if(e.code==='ENOENT')return {version:1,active:null,records:[]};throw Error('Den beskyttede ChatGPT-forbindelse kunne ikke laeses. Log ind igen eller kontroller Windows-brugeren.');}
  }
  async function saveStore() {
    const encrypted=await protector.protect(JSON.stringify(store));
    const temporary=filename+'.'+crypto.randomUUID()+'.tmp';
    try{await fs.writeFile(temporary,encrypted,{mode:0o600,flag:'wx'});await fs.rename(temporary,filename);}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  }
  async function withLock(work) {
    await fs.mkdir(directory,{recursive:true});
    const deadline=Date.now()+20000;
    let handle;
    while(!handle){
      try {handle=await fs.open(lockFile,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));}
      catch(e){
        if(e.code!=='EEXIST')throw Error('ChatGPT-sessionen kunne ikke laases.');
        try{const owner=JSON.parse(await fs.readFile(lockFile,'utf8'));try{process.kill(owner.pid,0);}catch(check){if(check.code==='ESRCH')await fs.rm(lockFile,{force:true});}}catch{}
        if(Date.now()>deadline)throw Error('ChatGPT-sessionen bruges af en anden proces. Proev igen om lidt.');
        await delay(100);
      }
    }
    try {store=await readStore();return await work();}
    finally {await handle.close();await fs.rm(lockFile,{force:true});}
  }
  async function ready() {
    if(!initialization)initialization=(async()=>{
      await fs.mkdir(directory,{recursive:true});
      try{const saved=JSON.parse(await fs.readFile(hostFile,'utf8'));if(/^urn:uuid:[0-9a-f-]{36}$/i.test(saved.host))host=saved.host;}catch{}
      if(!host){
        const proposed='urn:uuid:'+crypto.randomUUID();
        try{await fs.writeFile(hostFile,JSON.stringify({host:proposed}),{flag:'wx',mode:0o600});host=proposed;}
        catch(e){if(e.code!=='EEXIST')throw e;const saved=JSON.parse(await fs.readFile(hostFile,'utf8'));if(!/^urn:uuid:[0-9a-f-]{36}$/i.test(saved.host))throw Error('Invalid host identity.');host=saved.host;}
      }
      try{store=await readStore();settleStatus();}catch{status='error';error='Den beskyttede ChatGPT-fil kunne ikke laeses. Kontroller Windows-brugeren og gendan appens egen forbindelsesfil; den er ikke overskrevet.';}
    })();
    await initialization;
  }
  async function fetchControlled(url,options={}) {
    const controller=new AbortController();controllers.add(controller);
    const signal=AbortSignal.any([controller.signal,sessionController.signal,...(options.signal?[options.signal]:[])]);
    try{return await request(url,{...options,signal,redirect:'error'});}catch{throw Error('ChatGPT-forbindelsen kunne ikke kontakte OpenAI. Proev igen.');}
    finally{controllers.delete(controller);}
  }
  async function form(url,values) {
    const response=await fetchControlled(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values).toString(),signal:AbortSignal.timeout(15000)});
    let body={};try{body=await response.json();}catch{}
    if(!response.ok){const failure=Error('ChatGPT-godkendelse mislykkedes (HTTP '+response.status+', '+safeCode(body.error)+').');failure.oauthCode=safeCode(body.error);throw failure;}
    return body;
  }
  async function verifyIdentity(jwt,clientId,nonce,subject) {
    if(typeof jwt!=='string'||jwt.length>100000)throw Error('ChatGPT returnerede ikke et gyldigt ID-token.');
    async function loadKeys(){
      const response=await fetchControlled(JWKS,{signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('OpenAI signaturkontrol er utilgaengelig.');
      try{keySet=createLocalJWKSet(await response.json());keyAge=now();}catch{throw Error('OpenAI signaturnoegler kunne ikke laeses.');}
    }
    if(!keySet||now()-keyAge>600000)await loadKeys();
    let result;
    const options={issuer:ISSUER,audience:clientId,algorithms:['RS256'],currentDate:new Date(now()),clockTolerance:5,requiredClaims:['iss','aud','exp','sub']};
    try{result=await jwtVerify(jwt,keySet,options);}catch(e){
      if(e.code==='ERR_JWKS_NO_MATCHING_KEY'){await loadKeys();try{result=await jwtVerify(jwt,keySet,options);}catch{throw Error('ChatGPT ID-tokenets signatur eller gyldighed kunne ikke bekraeftes.');}}
      else throw Error('ChatGPT ID-tokenets signatur eller gyldighed kunne ikke bekraeftes.');
    }
    const claims=result.payload;
    if(typeof claims.sub!=='string'||!claims.sub||(nonce!==undefined&&!equal(claims.nonce,nonce))||(subject&&claims.sub!==subject))throw Error('ChatGPT-kontoen eller loginforsoeget matcher ikke den valgte forbindelse.');
    return claims;
  }
  function credentials(response,previous,claims) {
    if(typeof response.access_token!=='string'||!response.access_token||String(response.token_type).toLowerCase()!=='bearer'||!Number.isFinite(response.expires_in)||response.expires_in<=0||response.expires_in>2678400)throw Error('ChatGPT returnerede ufuldstaendige legitimationsoplysninger.');
    const scopes=typeof response.scope==='string'?scopesOf(response.scope):previous?.scopes||[];
    return {...previous,subject:claims?.sub||previous.subject,email:typeof claims?.email==='string'?claims.email:previous.email||'',issuer:ISSUER,id_token:response.id_token||previous.id_token||'',access_token:response.access_token,refresh_token:typeof response.refresh_token==='string'&&response.refresh_token?response.refresh_token:previous.refresh_token||'',token_type:'Bearer',scopes,expires_at:now()+response.expires_in*1000,saved_at:new Date(now()).toISOString()};
  }
  function closeAttempt(current) {
    clearTimeout(current.timer);current.server.close();if(attempt===current)attempt=null;
  }
  function callbackPage(res,ok) {
    res.writeHead(ok?200:400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer'});
    res.end(ok?'ChatGPT er tilsluttet. Du kan vende tilbage til Sigma AI.':'ChatGPT-login kunne ikke gennemfoeres. Vend tilbage til Sigma AI.');
  }
  async function startLogin({accountId:selectedId,newAccount=false}={}) {
    await ready();policy();
    if(disconnecting)throw Error('ChatGPT-forbindelsen er ved at blive afbrudt. Vent et oejeblik.');
    if(attempt)return getStatus();
    const previous=newAccount?null:(store.records.find(r=>r.id===(selectedId||store.active))||(!selectedId?store.records.findLast(r=>!r.subject):null));
    if(selectedId&&!previous)throw Error('Den valgte ChatGPT-konto findes ikke.');
    const expectedGeneration=generation;
    const current={state:nonceValue(),nonce:nonceValue(),verifier:nonceValue(),previous:previous?structuredClone(previous):null,clientId:previous?.client_id||'dynamic_agent_client',server:null,timer:null,processing:false,redirect:''};
    const server=http.createServer(async(req,res)=>{
      let callback;try{callback=new URL(req.url,current.redirect);}catch{res.writeHead(400);res.end();return;}
      if(req.method!=='GET'||callback.pathname!=='/auth/callback'){res.writeHead(404);res.end();return;}
      if(!equal(callback.searchParams.get('state'),current.state)||current.processing){callbackPage(res,false);return;}
      current.processing=true;
      try{
        policy();
        if(callback.searchParams.has('error'))throw Error('ChatGPT-login blev ikke godkendt ('+safeCode(callback.searchParams.get('error'))+').');
        const code=callback.searchParams.get('code');
        const issued=callback.searchParams.get('client_id');
        if(!code||code.length>20000)throw Error('ChatGPT-login returnerede ingen autorisationskode.');
        if(current.clientId==='dynamic_agent_client'){
          if(!issued||issued==='dynamic_agent_client'||issued.length>500||!/^[A-Za-z0-9_-]+$/.test(issued))throw Error('ChatGPT-registreringen returnerede intet udstedt klient-id.');
          current.clientId=issued;
          // Retain issued registration before exchange, even if its code is rejected.
          await withLock(async()=>{
            if(generation!==expectedGeneration)throw Error('Loginforsoeget er afbrudt.');
            let registration=store.records.find(r=>r.client_id===issued);
            if(registration?.subject)throw Error('ChatGPT returnerede en allerede registreret klient. Vaelg den gemte konto.');
            if(!registration){registration={id:accountId({client_id:issued}),client_id:issued,subject:'',scopes:[],host};store.records.push(registration);}
            current.registrationId=registration.id;await saveStore();
          });
        }else if(issued&&issued!==current.clientId)throw Error('ChatGPT returnerede et andet klient-id end den valgte konto.');
        const response=await form(TOKEN,{grant_type:'authorization_code',client_id:current.clientId,code,code_verifier:current.verifier,redirect_uri:current.redirect,resource:RESOURCE});
        const claims=await verifyIdentity(response.id_token,current.clientId,current.nonce,current.previous?.subject);
        await withLock(async()=>{
          if(generation!==expectedGeneration)throw Error('Loginforsoeget er afbrudt.');
          const record=credentials(response,current.previous||{client_id:current.clientId,scopes:[],host},claims);record.id=accountId(record);
          store.records=store.records.filter(r=>r.id!==record.id&&r.id!==current.registrationId);
          store.records.push(record);store.active=record.id;await saveStore();models=[];settleStatus();
        });
        callbackPage(res,true);closeAttempt(current);
        if(getStatus().sharing)listModels().catch(()=>{});
      }catch(e){status='error';error=e.message;callbackPage(res,false);closeAttempt(current);}
    });
    current.server=server;attempt=current;status='pending';error='';
    server.on('error',()=>{if(attempt===current){status='error';error='ChatGPT-login kunne ikke starte den lokale callback.';closeAttempt(current);}});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    current.redirect='http://127.0.0.1:'+server.address().port+'/auth/callback';
    current.timer=setTimeout(()=>{if(attempt===current){status='error';error='ChatGPT-login udloeb. Start et nyt login.';closeAttempt(current);}},authorizationTimeoutMs);current.timer.unref();
    const authorize=new URL(AUTHORIZE);
    const parameters={client_id:current.clientId,ext_agent_host_id:host,response_type:'code',redirect_uri:current.redirect,scope:SCOPES,resource:RESOURCE,state:current.state,nonce:current.nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(current.verifier).digest('base64url')};
    if(current.clientId==='dynamic_agent_client')parameters.agent_name_hint='Sigma AI';
    else if(current.previous?.id_token)parameters.id_token_hint=current.previous.id_token;
    if(current.previous?.email)parameters.login_hint=current.previous.email;
    for(const [key,value]of Object.entries(parameters))authorize.searchParams.set(key,value);
    Promise.resolve().then(()=>openBrowser(authorize.href)).catch(()=>{if(attempt===current){status='error';error='Systembrowseren kunne ikke aabne ChatGPT-login.';closeAttempt(current);}});
    return getStatus();
  }
  async function accessToken() {
    await ready();policy();
    if(disconnecting)throw Error('ChatGPT-forbindelsen er ved at blive afbrudt. Vent et oejeblik.');
    const selected=active();
    if(!hasTokens(selected))throw Error('Fortsaet med ChatGPT for at logge ind.');
    if(!selected.scopes.includes(DIRECT))throw Error('ChatGPT-planbrug er ikke godkendt.');
    if(selected.expires_at>now()+60000)return selected.access_token;
    if(!refreshFlight)refreshFlight=(async()=>{
      const expectedGeneration=generation,selectedId=selected.id;
      return withLock(async()=>{
        const record=store.records.find(r=>r.id===selectedId);
        if(generation!==expectedGeneration||store.active!==selectedId||!hasTokens(record))throw Error('ChatGPT-sessionen er aendret.');
        if(record.expires_at>now()+60000)return record.access_token;
        if(!record.refresh_token)throw Error('ChatGPT-login er udloebet. Log ind igen.');
        try{
          const response=await form(TOKEN,{grant_type:'refresh_token',client_id:record.client_id,refresh_token:record.refresh_token,resource:RESOURCE});
          const claims=response.id_token?await verifyIdentity(response.id_token,record.client_id,undefined,record.subject):null;
          const refreshed=credentials(response,record,claims);
          if(generation!==expectedGeneration)throw Error('ChatGPT-sessionen er afbrudt.');
          store.records[store.records.findIndex(r=>r.id===record.id)]=refreshed;
          await saveStore();settleStatus();
          if(!refreshed.scopes.includes(DIRECT))throw Error('ChatGPT-planbrug er ikke laengere godkendt.');
          return refreshed.access_token;
        }catch(e){
          if(e.oauthCode==='invalid_grant'){for(const key of ['access_token','refresh_token','id_token'])delete record[key];record.expires_at=0;await saveStore();models=[];}
          status='error';error=e.message;throw e;
        }
      });
    })().finally(()=>{refreshFlight=null;});
    return refreshFlight;
  }
  async function listModels() {
    await ready();policy();
    if(disconnecting)throw Error('ChatGPT-forbindelsen er ved at blive afbrudt. Vent et oejeblik.');
    if(catalogFlight)return catalogFlight;
    const expectedGeneration=generation,selectedId=store.active;
    catalogFlight=(async()=>{
      try{
        const token=await accessToken();
        if(expectedGeneration!==generation||selectedId!==store.active)throw Error('ChatGPT-kontoen er aendret.');
        const response=await fetchControlled(RESOURCE+'/models',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('ChatGPT-modeller kunne ikke hentes (HTTP '+response.status+').');
        let body;try{body=await response.json();}catch{throw Error('ChatGPT returnerede ikke et gyldigt modelkatalog.');}
        if(!Array.isArray(body.models))throw Error('ChatGPT returnerede ikke et gyldigt modelkatalog.');
        const catalog=body.models.filter(m=>m.visibility==='list'&&typeof m.slug==='string'&&m.slug&&typeof m.display_name==='string').map(m=>({slug:m.slug,display_name:m.display_name}));
        if(expectedGeneration!==generation||selectedId!==store.active)throw Error('ChatGPT-kontoen er aendret.');
        models=catalog;settleStatus();return models.map(m=>({...m}));
      }catch(e){if(expectedGeneration===generation){status='error';error=e.message;}throw e;}
    })().finally(()=>{catalogFlight=null;});
    return catalogFlight;
  }
  async function ask(model,payload,instructions) {
    await ready();policy();
    if(disconnecting)throw Error('ChatGPT-forbindelsen er ved at blive afbrudt. Vent et oejeblik.');
    const expectedGeneration=generation,selectedId=store.active;
    if(!models.some(m=>m.slug===model))await listModels();
    if(!models.some(m=>m.slug===model))throw Error('Den valgte model findes ikke i denne ChatGPT-kontos modelkatalog.');
    const token=await accessToken();
    if(expectedGeneration!==generation||selectedId!==store.active)throw Error('ChatGPT-kontoen er aendret.');
    try{
      const response=await fetchControlled(RESOURCE+'/responses',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({model,instructions:typeof instructions==='string'?instructions:'',input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(payload)}]}],store:false,stream:true}),signal:AbortSignal.timeout(150000)});
      if(!response.ok){
        // Only structured error identifiers are exposed, never a raw response,
        // request headers, credentials or calculation material.
        let detail='';
        try {const problem=await response.json();const err=problem.error;
          if(err&&typeof err==='object')detail='; kode '+safeCode(err.code)+'; felt '+safeCode(err.param);
          if(problem.detail==='Input must be a list')detail='; input skal være en liste';
        }catch{}
        throw Error('ChatGPT-svaret mislykkedes (HTTP '+response.status+detail+'). Ingen anden forbindelse er brugt.');
      }
      const answer=await consumeResponse(response);
      if(expectedGeneration!==generation||selectedId!==store.active)throw Error('ChatGPT-kontoen er aendret. Svaret er forkastet.');
      settleStatus();return answer;
    }catch(e){if(expectedGeneration===generation){status='error';error=e.message;}throw e;}
  }
  async function disconnect() {
    await ready();
    if(disconnectFlight)return disconnectFlight;
    disconnecting=true;status='disconnecting';
    disconnectFlight=(async()=>{
    generation++;models=[];
    if(attempt)closeAttempt(attempt);
    sessionController.abort();sessionController=new AbortController();
    for(const controller of controllers)controller.abort();
    let remoteConfirmed=true;
    await withLock(async()=>{
      const record=active();
      const renewable=record?.refresh_token?{token:record.refresh_token,clientId:record.client_id}:null;
      // Persist local logout before remote I/O: a crash during revocation must
      // never restore this session's credentials at the next application start.
      if(record){for(const key of ['access_token','refresh_token','id_token'])delete record[key];record.expires_at=0;await saveStore();}
      if(renewable){
        remoteConfirmed=false;
        try{
          const discovery=await fetchControlled(ISSUER+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(5000)});
          if(!discovery.ok)throw Error('Discovery unavailable.');
          const metadata=await discovery.json(),revoke=new URL(metadata.revocation_endpoint);
          if(revoke.origin!==ISSUER||revoke.username||revoke.password||revoke.hash)throw Error('Unexpected revocation endpoint.');
          for(let attempt=0;attempt<2;attempt++){
            try{const response=await fetchControlled(revoke.href,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:renewable.token,token_type_hint:'refresh_token',client_id:renewable.clientId}).toString(),signal:AbortSignal.timeout(5000)});if(response.status===200){remoteConfirmed=true;break;}if(response.status<500)break;}catch{}
            if(attempt===0)await delay(200);
          }
        }catch{}
      }
    });
    settleStatus();if(!remoteConfirmed){status='disconnected';error='Logget ud lokalt. Fjernfrakobling kunne ikke bekraeftes; fjern appens adgang i ChatGPT Indstillinger.';}
    return getStatus();
    })().finally(()=>{disconnecting=false;disconnectFlight=null;});
    return disconnectFlight;
  }
  async function selectAccount(id) {
    await ready();policy();
    if(disconnecting)throw Error('ChatGPT-forbindelsen er ved at blive afbrudt. Vent et oejeblik.');
    generation++;models=[];
    if(attempt)closeAttempt(attempt);
    sessionController.abort();sessionController=new AbortController();
    for(const controller of controllers)controller.abort();
    await withLock(async()=>{if(!store.records.some(r=>r.id===id))throw Error('ChatGPT-kontoen findes ikke.');store.active=id;await saveStore();});
    settleStatus();return getStatus();
  }
  return {ready,getStatus,startLogin,disconnect,selectAccount,listModels,ask};
}

export async function consumeResponse(response) {
  if(!response.body)throw Error('ChatGPT returnerede ingen svarstroem.');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',text='',completed=false,total=0;
  function event(block) {
    const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data||data==='[DONE]')return;
    let value;try{value=JSON.parse(data);}catch{throw Error('ChatGPT returnerede en ugyldig svarhaendelse.');}
    if(value.type==='response.output_text.delta')text+=typeof value.delta==='string'?value.delta:'';
    else if(value.type==='response.failed'||value.type==='error')throw Error('ChatGPT-svaret mislykkedes ('+safeCode(value.response?.error?.code||value.error?.code||value.code)+').');
    else if(value.type==='response.incomplete')throw Error('ChatGPT-svaret er ufuldstaendigt. Proev igen; svaret er ikke godkendt.');
    else if(value.type==='response.completed'){
      if(value.response?.status&&value.response.status!=='completed')throw Error('ChatGPT-svaret blev ikke fuldfoert.');
      const final=(value.response?.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text'&&typeof c.text==='string').map(c=>c.text).join('');
      if(final)text=final;completed=true;
    }
    if(text.length>200000)throw Error('ChatGPT-svaret er for langt.');
  }
  try{
    while(!completed){
      const next=await reader.read();
      if(next.done){buffer+=decoder.decode();break;}
      total+=next.value.length;if(total>3000000)throw Error('ChatGPT-svarstroemmen er for stor.');
      buffer+=decoder.decode(next.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');
      let boundary;
      while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);event(block);if(completed)break;}
    }
    if(!completed&&buffer.trim())event(buffer.replace(/\r\n/g,'\n'));
    if(!completed)throw Error('ChatGPT-svarstroemmen blev afbrudt foer response.completed.');
    if(!text.trim())throw Error('ChatGPT returnerede et tomt svar. Proev igen.');
    return text;
  }catch(e){if(e.message?.startsWith('ChatGPT'))throw e;throw Error('ChatGPT-svarstroemmen blev afbrudt.');}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
