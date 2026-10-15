import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const threadKey = state => state.mode + ':' + (state.projectFile ? 'file:'+state.projectFile.replaceAll('\\','/').toLowerCase() : state.projectId || state.name);
export function createConversation(data) {
  const file=path.join(data,'conversations.json');
  let threads={};
  try {const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved && typeof saved==='object' && !Array.isArray(saved))threads=saved;}catch{}
  const save=()=>{
    const keys=Object.keys(threads);for(const key of keys.slice(0,Math.max(0,keys.length-100)))delete threads[key];
    fs.writeFileSync(file+'.tmp',JSON.stringify(threads));fs.renameSync(file+'.tmp',file);
  };
  function list(state){return threads[threadKey(state)] || [];}
  return {
    list,
    move(previous,next) {const oldKey=threadKey(previous),newKey=threadKey(next);if(oldKey!==newKey && threads[oldKey] && !threads[newKey]){threads[newKey]=threads[oldKey];delete threads[oldKey];save();}},
    add(state,{kind='message',role='assistant',text,status='done',key,details,refreshDetails=false}) {
      const id=threadKey(state);
      const rows=threads[id] || (threads[id]=[]);
      const existing=key&&rows.find(row=>row.key===key);
      if(existing){if(refreshDetails){existing.details=details;existing.revision=state.revision;save();}return null;}
      const row={id:crypto.randomUUID(),kind,role,text:String(text).slice(0,16000),status,key,details,revision:state.revision,time:new Date().toISOString()};
      rows.push(row);if(rows.length>200)rows.splice(0,rows.length-200);save();return row;
    },
    finish(state,id,status='done',text) {const row=list(state).find(row=>row.id===id);if(row){row.status=status;if(text!==undefined)row.text=String(text).slice(0,16000);save();}},
  };
}

export function historyMessage(result) {
  if(result.status==='waiting')return result.reason;
  if(!result.matches.length)return 'Jeg fandt ingen tilstrækkeligt lignende tilbud i de '+result.indexed+' indekserede kalkulationsfiler. Jeg søger igen, når der kommer nye arbejdsbeskrivelser.';
  return 'Jeg fandt '+result.matches.length+' tidligere tilbud, der kan være '+(result.matches.length===1?'relevant':'relevante')+':\n\n'+result.matches.map((m,i)=>{
    const quantities=m.comparison?.quantities?.slice(0,3).map(q=>'• '+q.type+': nu '+q.current+' '+q.unit+', tidligere '+q.historical+' '+q.unit+' (størrelsesforskel ×'+q.factor+').').join('\n');
    return (i+1)+'. '+m.name+'\nFælles arbejdsord: '+m.shared.join(', ')+'.'+(quantities?'\n'+quantities:'\nMængdegrundlaget er endnu ikke sammenligneligt.')+'\nKilde: '+m.file;
  }).join('\n\n')+'\n\nJeg har sammenholdt arbejdsord, opgavetyper og de mængder, der kan sammenlignes på samme enhedsgrundlag. Adgangsforhold, prisniveau og faktisk udfald er fortsat uafklaret.';
}
