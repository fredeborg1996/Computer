import crypto from 'node:crypto';
import { contextNotice } from './chat-context.mjs';
import { caseSnapshot } from './chat-scope.mjs';

// Native Sigma UI transport. Model work is queued after HTTP response so the
// synchronous AppScript HTTP client never waits for model generation.
export function createNativeApi({ token, state, connected, settings, providers, bridge, conversation, ask, busy, broadcast, saveSettings, cloudPreview, prepareCloudSend, prepareCloudChat, account, panelSettings = () => ({width:380}), savePanelSettings, readiness = () => ({ready:false,error:"Modelstatus er ikke tilgaengelig.",checking:false}) }) {
  const jobs = new Map();
  let activeJob = null;
  const identity = snapshot => String(snapshot.projectId || '');
  function context(projectId, revision, requireRevision = false) {
    if(requireRevision && !Number.isSafeInteger(revision))throw Error("En aktuel revision skal angives.");
    const snapshot = state();
    if (snapshot.mode !== 'sigma' || !connected() || !identity(snapshot)) throw Error('Send først et aktuelt snapshot fra den åbne Sigma-sag.');
    if (projectId !== identity(snapshot)) throw Error('Sigma-sagen er ændret. Opdatér panelet fra den aktuelle sag.');
    if (revision !== undefined && revision !== snapshot.revision) throw Error('Kalkulationen er ændret. Opdatér før afsendelse.');
    return snapshot;
  }
  function queue(snapshot, question, work, json) {
    if (busy() || activeJob) {json(409,{error:'Modellen arbejder allerede.'}); return;}
    const id=crypto.randomUUID();
    const job={jobId:id,status:'queued',revision:snapshot.revision,projectId:identity(snapshot),answer:'',error:''};
    jobs.set(id,job);activeJob=id;
    for(const key of [...jobs.keys()].slice(0,Math.max(0,jobs.size-20)))jobs.delete(key);
    conversation.add(snapshot,{kind:'question',role:'user',text:question});broadcast();
    json(202,{jobId:id,revision:job.revision,projectId:job.projectId});
    setImmediate(async()=>{
      job.status='working';
      try {
        context(job.projectId,job.revision);
        const answer=await work();
        context(job.projectId,job.revision);
        job.answer=answer;job.status='done';conversation.add(snapshot,{kind:'reply',text:answer});
      }catch(e){
        job.status='error';job.error=e.message;
        if(identity(state())===job.projectId&&state().revision===job.revision)conversation.add(snapshot,{kind:'reply',text:'Svaret kunne ikke gennemfoeres: '+e.message,status:'error'});
      }finally{activeJob=null;broadcast();}
    });
  }
  return async function native(req, url, readBody, json) {
    if (!url.pathname.startsWith('/api/native/')) return false;
    if (req.headers.authorization !== 'Bearer ' + token) { json(401, {error:'Bridge-token mangler'}); return true; }
    try {
      if (url.pathname === '/api/native/panel' && req.method === 'POST') {
        const input=await readBody();
        if(![380,456].includes(input.width)||!savePanelSettings)throw Error('Ugyldig panelbredde.');
        savePanelSettings({width:input.width});json(200,panelSettings());return true;
      }
      if (url.pathname === '/api/native/account' && req.method === 'GET') {
        json(200,account ? account.status() : {connected:false,sharing:false,status:'unavailable',error:'ChatGPT-login er ikke tilkoblet.',models:[]}); return true;
      }
      if (['/api/native/account/login','/api/native/account/logout'].includes(url.pathname) && req.method === 'POST') {
        if (!account) {json(409,{error:'ChatGPT-login er ikke tilkoblet.'});return true;}
        if (busy() || activeJob) {json(409,{error:'Vent til modelsvar er afsluttet.'});return true;}
        const result = url.pathname.endsWith('/login') ? account.login() : account.logout();
        json(202,result); return true;
      }
      if (url.pathname === '/api/native/model/settings' && req.method === 'POST') {
        if (busy() || activeJob) { json(409,{error:'Vent til det igangværende svar er afsluttet.'}); return true; }
        const selected = await saveSettings(await readBody());
        json(200,{modelSettings:selected,providers:providers()}); return true;
      }
      if (url.pathname === '/api/native/view' && req.method === 'GET') {
        const snapshot = caseSnapshot(context(url.searchParams.get('projectId')));
        const panel=panelSettings();
        const selected = settings();
        const availability = readiness();
        const localModels = selected.mode === 'local' ? availability.models || [] : [];
        const transcript = conversation.list(snapshot).filter(m=>!['history','scan'].includes(m.kind)).slice(-40).map(m => (m.role === 'user' ? 'Dig: ' : 'Assistent: ') + m.text).join('\n\n').slice(-40000);
        const sources = snapshot.documents.map(d => (d.name || d.id) + ' · ' + (d.pageLabel || 'side ' + d.page) + '\n' + d.text.slice(0,1800)).join('\n\n').slice(0,30000);
        const pending = activeJob ? jobs.get(activeJob) : null;
        const visibleJob = pending?.projectId === identity(snapshot) && pending.revision === snapshot.revision ? {...pending} : null;
        json(200,{panel,caseName:snapshot.name,revision:snapshot.revision,projectId:identity(snapshot),mode:snapshot.mode,modelSettings:selected,providers:providers(),account:account?.status(),liveBridge:bridge(),transcript,sources,sourcesText:sources,items:snapshot.items?.map(i=>({id:i.id,text:i.text,unit:i.unit,qty:i.qty}))||[],documents:snapshot.documents.map(d=>({id:d.id,name:d.name||d.filename||d.id,page:d.page})),contextNotice,localModels,modelReady:availability.ready,modelError:availability.error,modelChecking:availability.checking,statusText:(!selected.confirmed?'Vaelg og gem en model. ':selected.mode==='local'?'Lokal model: '+selected.model+'. ':'Cloud: '+selected.provider+' / '+selected.model+'. ')+bridge().message+(availability.error?' '+availability.error:' Model klar.'),job:visibleJob}); return true;
      }
      if (url.pathname === '/api/native/chat' && req.method === 'POST') {
        const input = await readBody();
        const snapshot = structuredClone(context(input.projectId,input.revision,true));
        if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 4000) {json(400,{error:'Skriv et spørgsmål på højst 4000 tegn.'}); return true;}
        const selected = settings();
        if (!selected.confirmed) {json(409,{error:'Vælg og gem en model først.'}); return true;}
        if (selected.mode === 'cloud') {
          if(input.sendContext !== true || !prepareCloudChat) {json(409,{error:'Send spørgsmålet fra den opdaterede chat for at medtage relevant sagskontekst. Ingen data er sendt.'});return true;}
          if(busy()||activeJob){json(409,{error:'Modellen arbejder allerede.'});return true;}
          const prepared=prepareCloudChat(input.question,snapshot);
          queue(snapshot,input.question,prepared.run,json);return true;
        }
        queue(snapshot,input.question,()=>ask(input.question,snapshot),json);return true;
      }
      if(url.pathname==='/api/native/cloud/preview'&&req.method==='POST') {
        const input=await readBody();context(input.projectId,input.revision,true);
        json(200,cloudPreview(input));return true;
      }
      if(url.pathname==='/api/native/cloud/send'&&req.method==='POST') {
        const input=await readBody();
        const snapshot=structuredClone(context(input.projectId,input.revision,true));
        if(busy()||activeJob){json(409,{error:'Modellen arbejder allerede.'});return true;}
        const prepared=prepareCloudSend(input);
        queue(snapshot,prepared.question,prepared.run,json);return true;
      }
      if (url.pathname.startsWith('/api/native/jobs/') && req.method === 'GET') {
        context(url.searchParams.get('projectId'));
        // AppScript URL-encodes the path component, including UUID separators.
        // URL.pathname preserves those escapes; decode once before the lookup.
        const job = jobs.get(decodeURIComponent(url.pathname.slice('/api/native/jobs/'.length)));
        if (!job || job.projectId !== url.searchParams.get('projectId')) json(404,{error:'Ukendt svarjob for denne sag.'});
        else if (job.revision !== state().revision) json(409,{error:'Kalkulationen er ændret. Opdatér panelet før svaret anvendes.'});
        else json(200,{...job});
        return true;
      }
      json(404,{error:'Ukendt native-endpoint'}); return true;
    } catch(e) {json(409,{error:e.message});return true;}
  };
}
