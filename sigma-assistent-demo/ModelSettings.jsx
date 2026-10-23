import React, {useState} from 'react';

export function ModelSettings({settings, providers, health, api, onSaved, firstRun=false}) {
  const [mode,setMode]=useState(settings?.mode || ''), [provider,setProvider]=useState(settings?.provider || 'openai');
  const [model,setModel]=useState(settings?.model || ''), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const choice=providers?.choices?.find(p=>p.id===provider);
  async function save(e) {
    e.preventDefault();setBusy(true);setError('');
    try {await api('model/settings','POST',{mode,model:model.trim(),provider:mode==='cloud'?provider:null});await onSaved();}
    catch(e){setError(e.message);} finally{setBusy(false);}
  }
  function choose(next){setMode(next);setModel(next==='local'?(providers?.localModel||'qwen3.5:9b'):(choice?.model||''));setError('');}
  return <form className="model-settings" onSubmit={save}>
    <h2>{firstRun?'Vælg din AI-forbindelse':'AI-forbindelse'}</h2>
    <p>{firstRun?'Vælg aktivt, hvordan assistenten må behandle data. Ingen AI-analyse starter før dit valg er gemt.':'Dit gemte valg styrer chat og AI-vurdering. Ingen automatisk overgang til en anden model.'}</p>
    <fieldset><legend>Behandling</legend><label><input type="radio" name="model-mode" checked={mode==='local'} onChange={()=>choose('local')}/> Lokal model på denne pc</label><label><input type="radio" name="model-mode" checked={mode==='cloud'} disabled={providers?.localOnly} onChange={()=>choose('cloud')}/> Cloud · kun efter forhåndsvisning og godkendelse</label></fieldset>
    {providers?.localOnly&&<p>Virksomhedspolitik: kun lokal behandling er tilladt.</p>}
    {mode==='local'&&<><p>Ollama skal køre lokalt med den valgte model installeret. Data sendes ikke til cloud.</p><label>Ollama-model<input aria-label="Lokal model" value={model} required onChange={e=>setModel(e.target.value)} placeholder="qwen3.5:9b"/></label><p>Seneste kontrol: {health?.modelSettings?.mode==='local'&&health?.modelSettings?.model===model.trim()?(health?.installed?'valgt model tilgængelig':health?.error||'Modellen er ikke tilgængelig.'):'Tilgængelighed kontrolleres, når modelvalget er gemt.'}</p></>}
    {mode==='cloud'&&<><label>Udbyder<select aria-label="Cloududbyder" value={provider} onChange={e=>{setProvider(e.target.value);setModel(providers?.choices?.find(p=>p.id===e.target.value)?.model||'');}}>{providers?.choices?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Model<input aria-label="Cloudmodel" value={model} required onChange={e=>setModel(e.target.value)} placeholder="Indtast konkret model-id"/></label><p>{choice?.ready?'Serverens cloudforbindelse er konfigureret.':'Cloudopsætning mangler eller er ikke bekræftet. Konfigurér '+(provider==='anthropic'?'ANTHROPIC_API_KEY':'OPENAI_API_KEY')+' i serverens lokale miljø og genstart integrationen. Nøgler indtastes ikke her.'}</p><p>Chat kræver, at du vælger poster og kilder, ser præcis hvad der sendes og godkender afsendelsen.</p></>}
    {error&&<p role="alert" className="chat-inline-error">{error}</p>}
    <button className="primary" disabled={busy||!mode||!model.trim()}>{busy?'Kontrollerer og gemmer…':firstRun?'Gem modelvalg og fortsæt':'Gem modelvalg'}</button>
  </form>;
}
