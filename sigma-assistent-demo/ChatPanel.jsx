import React, {useEffect,useRef,useState} from 'react';
import {SigmaConnection} from './SigmaConnection.jsx';
import {ProviderPanel} from './ProviderPanel.jsx';
import {CaseDocumentsPanel} from './CaseDocumentsPanel.jsx';
import {HistoryPanel} from './HistoryPanel.jsx';

export function ChatPanel({data,health,api,reload,update,tab,setTab,setSource,setDecision,setReason,importDocs}) {
  const state=data.state;
  const [draft,setDraft]=useState(''),[pending,setPending]=useState(''),[error,setError]=useState('');
  const scroll=useRef(null),follow=useRef(true);
  const messages=data.chat || [];
  const liveChecks=(data.alerts||[]).filter(a=>!messages.some(m=>m.details?.fingerprint===a.fingerprint));
  const working=!!pending || data.modelReview?.status==='working';
  useEffect(()=>{if(follow.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[messages.length,messages.at(-1)?.id,liveChecks.length,working]);
  async function send(e) {
    e.preventDefault();const question=draft.trim();if(!question||working)return;
    setError('');setPending(question);setDraft('');follow.current=true;
    try {await api('chat','POST',{question,revision:state.revision});await reload();}
    catch(e){setError(e.message);setDraft(question);await reload();}
    finally {setPending('');}
  }
  function clarification(alert){setDecision(alert);setReason('');}
  function checkActions(fingerprint,source) {
    const alert=data.alerts.find(a=>a.fingerprint===fingerprint);
    return <div className="chat-message-actions">
      {source&&<button onClick={()=>setSource(source)}>▤ {source.name} · s. {source.page}</button>}
      {alert&&<button onClick={()=>clarification(alert)}>Gem min afklaring</button>}
      {alert?.id==='soil'&&state.mode==='demo'&&<button onClick={()=>update(s=>({...s,items:[...s.items,{id:'soil-'+Date.now(),text:'Jordprøver og dokumentation · PRIS MANGLER',qty:1,unit:'sum',price:0}]}))}>Tilføj demopost · pris mangler</button>}
    </div>;
  }
  return <aside className="assistant standard-chat" aria-label="Tilbudsmakker chat">
    <div className="chat-topbar"><div><b>Tilbudsmakker</b><small><span className="live-dot"/> {health?.installed?'Qwen 3.5 · 9B · lokal':'Lokal model ikke klar'}</small></div><button aria-label="Åbn kilder og indstillinger" onClick={()=>setTab(tab==='kontrol'?'indstillinger':'kontrol')}>{tab==='kontrol'?'☰':'✕'}</button></div>
    <div className="chat-case"><span>{state.mode==='demo'?'Demonstrationssag':state.name}</span><span>{state.mode==='demo'?'Sigma ikke tilsluttet':'Følger kalkulationen'}</span></div>
    <div className="chat-transcript" role="log" aria-label="Samtale med tilbudsmakkeren" aria-live="polite" tabIndex={0} ref={scroll} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;}}>
      {!messages.length&&<div className="chat-message assistant-message"><span className="chat-speaker">Tilbudsmakker</span><p>Jeg følger med, mens du regner. Når de første poster fra tilbudslisten kommer ind fra Sigma, søger jeg efter lignende tilbud.</p></div>}
      {messages.map(m=><div key={m.id} className={'chat-message '+(m.role==='user'?'user-message':'assistant-message')} data-kind={m.kind}>
        <span className="chat-speaker">{m.role==='user'?'Dig':'Tilbudsmakker'}{m.kind==='scan'&&m.status==='working'?' · søger…':''}</span>
        <p>{m.text}</p>
        {m.kind==='documents'&&<button onClick={()=>setTab('materiale')}>Se fundne filer</button>}
        {m.kind==='check'&&checkActions(m.details?.fingerprint,m.details?.source)}
        <small>{new Date(m.time).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})}{m.revision!==state.revision?' · tidligere besked':''}</small>
      </div>)}
      {pending&&!messages.some(m=>m.kind==='question'&&m.text===pending)&&<div className="chat-message user-message"><span className="chat-speaker">Dig</span><p>{pending}</p></div>}
      {liveChecks.map(a=><div className="chat-message assistant-message" key={a.fingerprint} data-kind="check"><span className="chat-speaker">Tilbudsmakker</span><p>{a.title+'\n\n'+a.body}</p>{checkActions(a.fingerprint,state.documents.find(d=>d.id===a.source))}</div>)}
      {working&&<div className="chat-typing" role="status"><span/> <span/> <span/> <small>{pending?'Skriver et svar…':'Gennemgår kalkulation og kilder…'}</small></div>}
      {error&&<p className="chat-inline-error" role="alert">{error}</p>}
    </div>
    <form className="chat-composer" onSubmit={send}><div><textarea aria-label="Besked til tilbudsmakkeren" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Skriv en besked…" rows={2} maxLength={4000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form.requestSubmit();}}}/><button type="submit" aria-label="Send besked" disabled={working||!draft.trim()||!health?.installed}>↑</button></div><small>Lokal behandling · forslag kræver din vurdering</small></form>
    {tab!=='kontrol'&&<div className="chat-drawer" aria-label="Kilder og indstillinger"><div className="chat-drawer-nav">{[['materiale','Kilder'],['afklaringer','Afklaringer'],['indstillinger','Indstillinger']].map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
      {tab==='materiale'&&<><h3>Udbudsmateriale</h3><CaseDocumentsPanel key={state.projectFile||state.projectId||state.name} info={data.caseDocuments} state={state} api={api} reload={reload}/><p>SAB/TAG og rettelsesblade er sagens kilder.</p>{state.documents.map(d=><button className="doc" key={d.id} onClick={()=>setSource(d)}>{d.name} · {d.pageLabel||`side ${d.page}`} ↗</button>)}<label className="import">Indlæs kildeuddrag (JSON)<input type="file" accept=".json" onChange={e=>importDocs(e.target.files[0])}/></label><p>PDF-udtræk: brug Import-Pdf.ps1. Originalerne ændres ikke.</p></>}
      {tab==='afklaringer'&&<><h3>Dine afklaringer</h3>{state.decisions.length?state.decisions.map((d,i)=><div key={i}><b>{d.title||'Afklaring'}</b><p>{d.reason}</p></div>):<p>Ingen afklaringer endnu.</p>}</>}
      {tab==='indstillinger'&&<><label className="chat-auto"><input aria-label="Automatisk AI-vurdering" type="checkbox" checked={data.autoEnabled!==false} onChange={async e=>{await api('auto','POST',{enabled:e.target.checked});await reload();}}/>Automatisk AI-vurdering</label><HistoryPanel history={data.history} api={api} reload={reload}/><SigmaConnection info={data.sigmaWatch} api={api} reload={reload} source={state.sigmaSource}/><ProviderPanel state={state} providers={data.providers} api={api}/></>}
    </div>}
  </aside>;
}
