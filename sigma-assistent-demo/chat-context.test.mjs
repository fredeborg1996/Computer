import test from 'node:test';
import assert from 'node:assert/strict';
import { initial } from './engine.mjs';
import { createConversation } from './conversation.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { buildChatContext, formatChatAnswer, prepareAutomaticCloudChat } from './chat-context.mjs';

test('named tender section includes its rows beyond first forty and retains existing prices',()=>{
  const state={...initial(),mode:'sigma',projectId:'synthetic-A',name:'Synthetic'};
  state.items=[{id:'1',parentId:null,text:'Byggeplads',qty:1,price:0},
    ...Array.from({length:50},(_,i)=>({id:'1.'+i,parentId:'1',text:'Other section '+i,qty:1,price:0})),
    {id:'2',parentId:null,text:'Fra tilbudslisten',qty:1,price:0},
    {id:'2.1',parentId:'2',text:'Afsætning',qty:1,unit:'sum',price:0},
    {id:'2.2',parentId:'2',text:'Jordarbejde',qty:76,unit:'m3',price:300.89},
    {id:'2.2.1',parentId:'2.2',text:'Gravemaskine',qty:4,unit:'timer',price:650}];
  const result=buildChatContext(state,'Gennemgå Fra tilbudslisten og manglende priser.');
  assert.deepEqual(result.DATA.items.map(i=>i.id),['2','2.1','2.2','2.2.1']);
  assert.equal(result.DATA.items[2].price,300.89);assert.equal(result.DATA.items[2].qty,76);
  assert.equal(result.DATA.itemCoverage.partial,true);
  assert.equal(result.DATA.itemCoverage.scope,'named-section');
  assert.equal(buildChatContext(state,'Hej').DATA.items.length,40);
});

function snapshot(){const s=initial();s.documents=s.documents.map(d=>({...d,projectId:'synthetic-A'}));return {...s,mode:'sigma',projectId:'synthetic-A',name:'Private Full Case Name',projectFile:'C:\\Private\\case.sig'};}
test('automatic context is bounded, omits original paths/names/prices and retains same-case continuity',t=>{
  const state=snapshot();state.items=Array.from({length:60},(_,i)=>({...state.items[0],id:'I'+i,text:'Private Full Case Name drainage '+i}));
  state.documents=Array.from({length:10},(_,i)=>({id:'D'+i,projectId:'synthetic-A',page:i+1,text:'Drainage requirements '.repeat(500),filename:'C:\\Private\\original.pdf',name:'Private Full Case Name'}));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sigma-chat-context-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const conversation=createConversation(directory);
  const other={...state,projectId:'synthetic-B',projectFile:'C:\\Private\\other.sig'};
  conversation.add(other,{kind:'reply',text:'OTHER CASE MUST NOT LEAK'});
  for(let i=0;i<12;i++)conversation.add(state,{kind:i%2?'reply':'question',role:i%2?'assistant':'user',text:'message '+i});
  conversation.add(state,{kind:'history',text:'Jeg fandt Older Secret Case, relevant drainage\nKilde: C:\\Private User\\old.sig'});
  const historical={status:'done',matches:[{name:'Older Secret Case',file:'C:\\Private\\old.sig',score:80,shared:['drainage'],examples:[{text:'drainage pipe',unit:'m',qty:12,price:999999}],comparison:{quantities:[{type:'drainage',unit:'m',current:10,historical:12,factor:1.2}]}}]};
  const payload=buildChatContext(state,'Sammenlign med tidligere tilbud',conversation.list(state),historical),json=JSON.stringify(payload);
  assert.equal(payload.DATA.items.length,40);assert(payload.DATA.documents.length<=6);assert(payload.DATA.documents.reduce((n,d)=>n+d.text.length,0)<=12000);
  assert.equal(payload.DATA.recentConversation.filter(m=>['question','reply'].includes(m.kind)).length,6);
  assert(json.includes('relevant drainage'));assert(!json.includes('OTHER CASE'));assert(!json.includes('Private Full Case Name'));assert(!json.includes('Older Secret Case'));assert(!json.includes('C:\\'));assert(!json.includes('999999'));
  assert.equal(payload.DATA.historicalCandidates.matches[0].id,'H1');assert.equal(payload.DATA.historicalCandidates.matches[0].comparison.quantities[0].historical,12);
});

test('ordinary greetings/history need no irrelevant citation, offered or substantive document claims are checked',()=>{
  const state=snapshot(),greeting=buildChatContext(state,'Hej',[],{matches:[]});
  assert.equal(formatChatAnswer(JSON.stringify({answer:'Hej! Hvad vil du undersøge?',basis:'conversation',sources:[]}),greeting),'Hej! Hvad vil du undersøge?');
  const historical=buildChatContext(state,'Sammenlign med tidligere tilbud',[],{matches:[{name:'Old candidate',score:20}]});
  assert.match(formatChatAnswer(JSON.stringify({answer:'H1 er en kandidat fra den lokale historik.',basis:'history',sources:[]}),historical),/ingen historisk pris er valideret/);
  assert.match(formatChatAnswer(JSON.stringify({answer:'H9 er relevant',basis:'history',sources:[]}),historical),/Uafklaret/);
  assert.match(formatChatAnswer(JSON.stringify({answer:'H1 er relevant',basis:'history',sources:[]}),greeting),/Uafklaret/);
  assert.match(formatChatAnswer(JSON.stringify({answer:'Kravet gælder.',basis:'documents',sources:[]}),greeting),/Uafklaret/);
  assert.match(formatChatAnswer(JSON.stringify({answer:'Hej',sources:[{id:'invented',quote:'This quote does not exist'}]}),greeting),/Uafklaret/);
  const doc=state.documents[0],payload=buildChatContext(state,'Hvad siger dokumentet?');
  assert.match(formatChatAnswer(JSON.stringify({answer:'Et dokumenteret krav.',basis:'documents',sources:[{id:doc.id,quote:doc.text.slice(0,25)}]}),payload),/Kildeuddrag/);
});

test('cloud send binds policy, exact model/auth/account before and after inference; never falls back',async()=>{
  const state=snapshot();let selection={confirmed:true,mode:'cloud',provider:'openai',auth:'chatgpt',model:'exact-slug'},account='A',localOnly=false,calls=0,finish;
  const prepare=()=>prepareAutomaticCloudChat({snapshot:state,question:'Hej',selection:{...selection},getSelection:()=>selection,accountId:account,getAccountId:()=>account,localOnly,getLocalOnly:()=>localOnly,messages:[],historical:{matches:[]},invoke:async(choice,payload,instructions)=>{calls++;assert.equal(choice.model,'exact-slug');assert(instructions.includes('almindelig samtale'));return new Promise(resolve=>finish=resolve);}});
  localOnly=true;assert.throws(prepare,/kun lokal/);localOnly=false;
  const before=prepare();account='B';await assert.rejects(before.run(),/konto er ændret/);assert.equal(calls,0);
  account='A';const queued=prepare(),running=queued.run();assert.equal(calls,1);account='B';finish(JSON.stringify({answer:'Hello',basis:'conversation',sources:[]}));await assert.rejects(running,/konto er ændret/);assert.equal(calls,1);
  account='A';const changed=prepare();selection={...selection,auth:'api-key'};await assert.rejects(changed.run(),/Model eller/);assert.equal(calls,1);
});

test('isolated server ordinary native cloud chat actually routes one Send with automatic context and conversation',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sigma-ordinary-chat-api-'));
  let child;
  t.after(async()=>{if(child&&child.exitCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed;}fs.rmSync(directory,{recursive:true,force:true});});
  const capture=path.join(directory,'captured-request.json'),preload=path.join(directory,'mock-cloud.mjs');
  fs.writeFileSync(preload,`import fs from 'node:fs';globalThis.fetch=async(url,options={})=>{if(String(url)==='https://api.openai.com/v1/responses'){fs.writeFileSync(${JSON.stringify(capture)},options.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Hej fra kontrolleret cloudmodel',basis:'conversation',sources:[]})}]}]});}throw Error('Unexpected request blocked by synthetic test');};`);
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'server.mjs'],{cwd:import.meta.dirname,windowsHide:true,env:{...process.env,PORT:String(port),SIGMA_DATA_DIR:directory,SIGMA_HISTORY_ROOT:'',SIGMA_AUTOREVIEW:'0',SIGMA_LOCAL_ONLY:'',SIGMA_LIVE_BRIDGE:'0',OPENAI_API_KEY:'synthetic-test-only',ANTHROPIC_API_KEY:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));setTimeout(()=>reject(Error('Server timeout')),5000).unref();});
  const token=fs.readFileSync(path.join(directory,'bridge-token.txt'),'utf8').trim();
  async function call(endpoint,body){const response=await fetch('http://127.0.0.1:'+port+endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
  await call('/api/model/settings',{mode:'cloud',provider:'openai',auth:'api-key',model:'synthetic-exact-model'});
  const synced=await call('/api/sigma/snapshot',{name:'Private Full Case Name',projectId:'synthetic-A',items:initial().items,sourceKind:'appscript'});
  const request={projectId:synced.body.projectId,revision:synced.body.revision,question:'Hej'};
  assert.equal((await call('/api/native/chat',request)).status,409);assert(!fs.existsSync(capture));
  async function send(question){const sent=await call('/api/native/chat',{...request,question,sendContext:true});assert.equal(sent.status,202);for(let i=0;i<100;i++){const job=await call('/api/native/jobs/'+sent.body.jobId+'?projectId='+request.projectId);if(job.body.status==='done')return job.body;if(job.body.status==='error')throw Error(job.body.error);await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Job timeout');}
  assert.equal((await send('Hej')).answer,'Hej fra kontrolleret cloudmodel');
  await send('Kan du forklare det?');
  const wire=JSON.parse(fs.readFileSync(capture,'utf8')),payload=JSON.parse(wire.input);
  assert.equal(wire.model,'synthetic-exact-model');assert(wire.instructions.includes('almindelig samtale'));
  assert(payload.DATA.items.length>0);assert(payload.DATA.recentConversation.some(m=>m.text==='Hej fra kontrolleret cloudmodel'));assert(!wire.input.includes('Private Full Case Name'));
});
