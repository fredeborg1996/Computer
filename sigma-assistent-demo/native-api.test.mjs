import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeApi } from './native-api.mjs';

function fixture(account,readiness,prepareCloudChat) {
  let current={mode:'sigma',projectId:'case-A',revision:1,documents:[{id:'SYNTH',page:1,text:'Syntetisk kildegrundlag'}]};
  let selected={confirmed:true,mode:'local',model:'controlled'};
  let complete;
  const answers=[];
  let cloudCalls=0;
  let previewCalls=0;
  const api=createNativeApi({account,readiness,prepareCloudChat,token:'synthetic-token',state:()=>current,connected:()=>true,settings:()=>selected,providers:()=>({choices:[]}),bridge:()=>({status:'waiting'}),conversation:{list:()=>answers,add:(_snapshot,m)=>answers.push(m)},ask:()=>new Promise(resolve=>complete=resolve),busy:()=>false,broadcast:()=>{},saveSettings:s=>selected=s,cloudPreview:input=>{previewCalls++;return {ticket:'synthetic-ticket',hash:'controlled-hash',payload:input.selection};},prepareCloudSend:input=>{if(input.ticket!=='synthetic-ticket'||input.hash!=='controlled-hash')throw Error('Invalid preview');return {question:'Explicit cloud question',run:async()=>{cloudCalls++;return 'Controlled cloud answer';}};}});
  return {answers,cloudCalls:()=>cloudCalls,previewCalls:()=>previewCalls,setState:s=>current=s,setSettings:s=>selected=s,complete:answer=>complete(answer),async call(path,method='GET',body={},authorized=true) {
    let result;
    const handled=await api({method,headers:authorized?{authorization:'Bearer synthetic-token'}:{}},new URL(path,'http://127.0.0.1'),async()=>body,(status,value)=>result={status,value});
    return {handled,...result};
  }};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('AppScript percent-encoded job identifiers poll the same result and preserve case guards',async()=>{
  const f=fixture();
  const sent=await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Syntetisk test'});
  const encoded=[...sent.value.jobId].map(c=>'%'+c.charCodeAt(0).toString(16)).join('');
  const endpoint='/api/native/jobs/'+encoded+'?projectId=case-A';
  assert.equal((await f.call(endpoint)).status,200);
  await tick();f.complete('Kontrolleret svar');await tick();
  assert.equal((await f.call(endpoint)).value.answer,'Kontrolleret svar');
  f.setState({mode:'sigma',projectId:'case-B',revision:1,documents:[]});
  assert.equal((await f.call('/api/native/jobs/'+encoded+'?projectId=case-B')).status,404);
  assert.equal((await f.call('/api/native/jobs/%ZZ?projectId=case-B')).status,409);
});
test('ordinary cloud Send queues one job with automatic context, no preview or manual selection',async()=>{
  let calls=0;
  const f=fixture(undefined,undefined,(question,snapshot)=>({run:async()=>{calls++;assert.equal(question,'Kan du forklare dem?');assert.equal(snapshot.projectId,'case-A');return 'Almindeligt cloud-svar';}}));
  f.setSettings({confirmed:true,mode:'cloud',provider:'openai',auth:'chatgpt',model:'exact-slug'});
  assert.equal((await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Kan du forklare dem?'})).status,409);
  const sent=await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Kan du forklare dem?',sendContext:true});
  assert.equal(sent.status,202);assert.equal(calls,0);assert.equal(f.previewCalls(),0);
  await tick();const result=await f.call('/api/native/jobs/'+sent.value.jobId+'?projectId=case-A');
  assert.equal(result.value.status,'done');assert.equal(result.value.answer,'Almindeligt cloud-svar');assert.equal(calls,1);assert.equal(f.previewCalls(),0);
  assert.match((await f.call('/api/native/view?projectId=case-A')).value.contextNotice,/Historik bruges kun/);
});
test('native API requires bearer and current matching Sigma case, excludes demos',async()=>{
  const f=fixture();
  assert.equal((await f.call('/api/native/view?projectId=case-A','GET',{},false)).status,401);
  assert.equal((await f.call('/api/native/view?projectId=case-B')).status,409);
  assert.equal((await f.call('/api/native/view?projectId=case-A')).status,200);
  f.setState({mode:'demo',projectId:'case-A',revision:1,documents:[]});
  assert.equal((await f.call('/api/native/view?projectId=case-A')).status,409);
});
test('native chat returns before model work, polls grounded result and prevents duplicate jobs',async()=>{
  const f=fixture();
  const queued=await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Syntetisk test'});
  assert.equal(queued.status,202);
  const endpoint='/api/native/jobs/'+queued.value.jobId+'?projectId=case-A';
  assert.equal((await f.call(endpoint)).value.status,'queued');
  assert.equal((await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Duplicate'})).status,409);
  await tick();
  assert.equal((await f.call(endpoint)).value.status,'working');
  f.complete('Kontrolleret grounded svar med Kildeuddrag: SYNTH');await tick();
  assert.equal((await f.call(endpoint)).value.status,'done');
  assert.equal(f.answers.at(-1).text,'Kontrolleret grounded svar med Kildeuddrag: SYNTH');
});
test('native chat rejects unconfirmed/cloud choices and discards results after case switch',async()=>{
  const f=fixture();
  f.setSettings({confirmed:false});
  assert.equal((await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Test'})).status,409);
  f.setSettings({confirmed:true,mode:'cloud'});
  assert.equal((await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Test'})).status,409);
  f.setSettings({confirmed:true,mode:'local'});
  assert.equal((await f.call('/api/native/chat','POST',{projectId:'case-A',revision:0,question:'Test'})).status,409);
  const queued=await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Test'});await tick();
  f.setState({mode:'sigma',projectId:'case-B',revision:2,documents:[]});f.complete('Old case answer');await tick();
  assert.equal(f.answers.length,1);
  assert.equal((await f.call('/api/native/jobs/'+queued.value.jobId+'?projectId=case-B')).status,404);
});

test('native cloud preview never calls provider and approved send uses asynchronous job',async()=>{
  const f=fixture();f.setSettings({confirmed:true,mode:'cloud',provider:'openai',model:'explicit-model'});
  const preview=await f.call('/api/native/cloud/preview','POST',{projectId:'case-A',revision:1,provider:'openai',question:'Cloud question',selection:{items:['synthetic-item'],documents:['SYNTH']}});
  assert.equal(preview.status,200);assert.equal(f.previewCalls(),1);assert.equal(f.cloudCalls(),0);
  assert.equal((await f.call('/api/native/cloud/send','POST',{projectId:'case-B',revision:1,ticket:preview.value.ticket,hash:preview.value.hash})).status,409);
  assert.equal(f.cloudCalls(),0);
  const sent=await f.call('/api/native/cloud/send','POST',{projectId:'case-A',revision:1,ticket:preview.value.ticket,hash:preview.value.hash});
  assert.equal(sent.status,202);assert.equal(f.cloudCalls(),0);
  await tick();await tick();assert.equal(f.cloudCalls(),1);
  const result=await f.call('/api/native/jobs/'+sent.value.jobId+'?projectId=case-A');
  assert.equal(result.value.status,'done');assert.equal(result.value.answer,'Controlled cloud answer');
});

test('native view hides active job after project switch or revision change', async()=>{
  const f=fixture();
  await f.call('/api/native/chat','POST',{projectId:'case-A',revision:1,question:'Private case A question'});
  await tick();
  assert.equal((await f.call('/api/native/view?projectId=case-A')).value.job.status,'working');
  f.setState({mode:'sigma',projectId:'case-B',revision:1,documents:[]});
  assert.equal((await f.call('/api/native/view?projectId=case-B')).value.job,null);
  f.setState({mode:'sigma',projectId:'case-A',revision:2,documents:[]});
  assert.equal((await f.call('/api/native/view?projectId=case-A')).value.job,null);
  f.complete('Old answer');await tick();
  assert.equal((await f.call('/api/native/view?projectId=case-A')).value.job,null);
});
import { createModelReadiness } from './model-readiness.mjs';

test('native model readiness returns immediately, caches exact model and exposes missing credentials',async()=>{
  let selected={confirmed:true,mode:'local',model:'model-A'};
  let finish, calls=0, clock=0;
  const readiness=createModelReadiness({settings:()=>selected,providers:()=>({localOnly:false,choices:[{id:'openai',ready:false}]}),now:()=>clock,request:()=>{calls++;return new Promise(resolve=>finish=resolve);}});
  assert.equal(readiness().checking,true);assert.equal(calls,0);
  await tick();assert.equal(calls,1);
  assert.equal(readiness().ready,false);assert.equal(calls,1);
  finish({ok:true,json:async()=>({models:[{name:'model-A'}]})});await tick();
  assert.equal(readiness().ready,true);assert.equal(calls,1);
  assert.deepEqual(readiness().models,[{name:'model-A'}]);
  selected={confirmed:true,mode:'local',model:'model-B'};
  assert.equal(readiness().checking,true);await tick();assert.equal(calls,2);
  finish({ok:true,json:async()=>({models:[{name:'model-A'}]})});await tick();
  assert.match(readiness().error,/ikke installeret/);
  clock=6000;assert.equal(readiness().checking,true);await tick();assert.equal(calls,3);
  finish({ok:false,status:503});await tick();assert.match(readiness().error,/503/);
  selected={confirmed:true,mode:'cloud',provider:'openai',model:'cloud-model'};
  assert.equal(readiness().ready,false);assert.match(readiness().error,/Cloudnoegle mangler/);assert.equal(calls,3);
  selected={confirmed:false};assert.match(readiness().error,/gem en model/);
});

test('native account controls require token but work before Sigma snapshot and never send model data', async()=>{
  let logins=0,logouts=0;
  const f=fixture({status:()=>({connected:false,sharing:false,status:'disconnected',models:[]}),login:()=>{logins++;return {status:'pending'};},logout:()=>{logouts++;return {status:'disconnecting'};}});
  f.setState({mode:'demo',revision:1,documents:[]});
  assert.equal((await f.call('/api/native/account/login','POST',{},false)).status,401);
  assert.equal(logins,0);
  assert.equal((await f.call('/api/native/account')).value.status,'disconnected');
  assert.equal((await f.call('/api/native/account/login','POST')).status,202);
  assert.equal((await f.call('/api/native/account/logout','POST')).status,202);
  assert.equal(logins,1);assert.equal(logouts,1);assert.equal(f.cloudCalls(),0);assert.equal(f.answers.length,0);
});

test('native view exposes Ollama catalog only with local model selection',async()=>{
  const f=fixture(undefined,()=>({ready:true,error:'',checking:false,models:[{name:'qwen-local-only'}]}));
  assert.deepEqual((await f.call('/api/native/view?projectId=case-A')).value.localModels,[{name:'qwen-local-only'}]);
  f.setSettings({confirmed:true,mode:'cloud',provider:'openai',model:'account-model',auth:'chatgpt'});
  assert.deepEqual((await f.call('/api/native/view?projectId=case-A')).value.localModels,[]);
});
