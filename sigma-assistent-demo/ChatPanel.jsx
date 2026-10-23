import React, {useEffect,useRef,useState} from 'react';
import {ModelSettings} from './ModelSettings.jsx';
import {SigmaConnection} from './SigmaConnection.jsx';
import {ProviderPanel} from './ProviderPanel.jsx';
import {CaseDocumentsPanel} from './CaseDocumentsPanel.jsx';
import {HistoryPanel} from './HistoryPanel.jsx';

export function ChatPanel({data,health,api,reload,update,tab,setTab,setSource,setDecision,setReason,importDocs}) {
  const state=data.state;
  const settings=data.modelSettings;
  const cloud=settings?.mode==='cloud';
  const modelReady=!!health && (cloud?health.configured:health.installed);
  const modelLabel=!health?'Serverforbindelse ikke bekræftet':health.error||`${settings?.model || 'Model ikke valgt'} · ${cloud?'cloud':'lokal'}`;
  const [draft,setDraft]=useState(''),[pending,setPending]=useState(''),[error,setError]=useState('');
  const scroll=useRef(null),follow=useRef(true);
  const messages=data.chat || [];
  const liveChecks=(data.alerts||[]).filter(a=>!messages.some(m=>m.details?.fingerprint===a.fingerprint));
  const working=!!pending || data.modelReview?.status==='working';
  useEffect(()=>{if(follow.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[messages.length,messages.at(-1)?.id,liveChecks.length,working]);
  async function send(e) {
    e.preventDefault();const question=draft.trim();if(!question||working||cloud||!modelReady)return;
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
    <div className="chat-topbar"><div><b>Tilbudsmakker</b><small><span className={modelReady?'live-dot':'status-dot-off'}/> {modelLabel}</small></div><button aria-label="Åbn kilder og indstillinger" onClick={()=>setTab(tab==='kontrol'?'indstillinger':'kontrol')}>{tab==='kontrol'?'☰':'✕'}</button></div>
    <div className="chat-case"><span>{state.mode==='demo'?'Demonstrationssag':state.name}</span><span>{state.mode==='demo'?'Sigma ikke tilsluttet':data.sigmaWatch?.error?'Sigma-filfejl':data.lastSigma?'Snapshot '+new Date(data.lastSigma).toLocaleTimeString('da-DK'):'Forbindelse ikke bekræftet'}</span></div>
    <div className="chat-transcript" role="log" aria-label="Samtale med tilbudsmakkeren" aria-live="polite" tabIndex={0} ref={scroll} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;}}>
      {!messages.length&&<div className="chat-message assistant-message"><span className="chat-speaker">Tilbudsmakker</span><p>Her kan du stille spørgsmål til de indlæste poster og kilder. Sigma-oplysninger er snapshots; forbindelsen ses under indstillinger.</p></div>}
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
    <form className="chat-composer" onSubmit={send}><div><textarea aria-label="Besked til tilbudsmakkeren" disabled={cloud||!modelReady} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={cloud?'Cloud: vælg data og godkend under indstillinger':'Skriv en besked…'} rows={2} maxLength={4000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form.requestSubmit();}}}/><button type="submit" aria-label="Send besked" disabled={working||!draft.trim()||!modelReady||cloud}>↑</button></div><small>{cloud?'Cloud kræver valg af data og godkendelse':'Lokal behandling · forslag kræver din vurdering'}</small>{cloud&&<button type="button" className="cloud-open" onClick={()=>setTab("indstillinger")}>Vælg data til cloudtjek</button>}</form>
    {tab!=='kontrol'&&<div className="chat-drawer" aria-label="Kilder og indstillinger"><div className="chat-drawer-nav">{[['materiale','Kilder'],['afklaringer','Afklaringer'],['indstillinger','Indstillinger']].map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
      {tab==='materiale'&&<><h3>Udbudsmateriale</h3><CaseDocumentsPanel key={state.projectFile||state.projectId||state.name} info={data.caseDocuments} state={state} api={api} reload={reload}/><p>SAB/TAG og rettelsesblade er sagens kilder.</p>{state.documents.map(d=><button className="doc" key={d.id} onClick={()=>setSource(d)}>{d.name} · {d.pageLabel||`side ${d.page}`} ↗</button>)}<label className="import">Indlæs kildeuddrag (JSON)<input type="file" accept=".json" onChange={e=>importDocs(e.target.files[0])}/></label><p>PDF-udtræk: brug Import-Pdf.ps1. Originalerne ændres ikke.</p></>}
      {tab==='afklaringer'&&<><h3>Dine afklaringer</h3>{state.decisions.length?state.decisions.map((d,i)=><div key={i}><b>{d.title||'Afklaring'}</b><p>{d.reason}</p></div>):<p>Ingen afklaringer endnu.</p>}</>}
      {tab==='indstillinger'&&<><ModelSettings key={"model:"+JSON.stringify(settings)} settings={settings} providers={data.providers} health={health} api={api} onSaved={reload}/><label className="chat-auto"><input aria-label="Automatisk AI-vurdering" type="checkbox" disabled={cloud} checked={!cloud&&data.autoEnabled!==false} onChange={async e=>{try{await api('auto','POST',{enabled:e.target.checked});await reload();}catch(e){setError(e.message);}}}/>Automatisk AI-vurdering</label><HistoryPanel history={data.history} api={api} reload={reload}/><p role="status">{health?.liveBridge?.message || data.liveBridge?.message}</p><SigmaConnection info={data.sigmaWatch} api={api} reload={reload} source={state.sigmaSource}/><ProviderPanel key={"provider:"+JSON.stringify(settings)} state={state} settings={settings} providers={data.providers} api={api}/></>}
    </div>}
  </aside>;
}
