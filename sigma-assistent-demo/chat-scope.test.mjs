import test from 'node:test';
import assert from 'node:assert/strict';
import {caseSnapshot,wantsHistory} from './chat-scope.mjs';
import {buildChatContext} from './chat-context.mjs';
import {initial} from './engine.mjs';

test('case evidence excludes foreign and unbound legacy documents',()=>{
  const snapshot={...initial(),mode:'sigma',projectId:'A',projectFile:'C:/cases/A.sig',documents:[
    {id:'A',projectId:'A',text:'Current case'},
    {id:'B',projectId:'B',projectFile:'C:/cases/B.sig',text:'Other case'},
    {id:'legacy',text:'Legacy unbound SAB'}]};
  assert.deepEqual(caseSnapshot(snapshot).documents.map(d=>d.id),['A']);
  assert.deepEqual(buildChatContext(snapshot,'Hvad siger SAB?').DATA.documents.map(d=>d.id),['A']);
});
test('history is opt-in and automatic history status cannot leak into ordinary answers',()=>{
  const snapshot={...initial(),mode:'sigma',projectId:'A',documents:[]};
  const history={matches:[{name:'Other case',examples:[{text:'SECRET HISTORY'}]}]};
  const messages=[{kind:'history',text:'SECRET HISTORY'}];
  const ordinary=buildChatContext(snapshot,'Hvad koster pumpen?',messages,history);
  assert.equal(ordinary.DATA.historicalCandidates.matches.length,0);
  assert(!JSON.stringify(ordinary).includes('SECRET HISTORY'));
  assert(wantsHistory('Sammenlign med tidligere tilbud'));
  assert.equal(buildChatContext(snapshot,'Sammenlign med tidligere tilbud',[],history).DATA.historicalCandidates.matches.length,1);
});
test('questions retrieve matching calculation rows beyond the first forty',()=>{
  const snapshot={...initial(),mode:'sigma',projectId:'A',documents:[],items:
    Array.from({length:60},(_,i)=>({id:String(i),text:i===59?'Filtermuld med materialer':'Anden post',qty:1,price:10,unit:'m3'}))};
  assert.equal(buildChatContext(snapshot,'Hvad koster filtermuld?').DATA.items[0].id,'59');
});
