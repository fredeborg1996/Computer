import React, { useState } from 'react';

export function ProviderPanel({ state, settings, providers, api }) {
  const provider = settings?.provider||'openai';
  const [items, setItems] = useState([]), [documents, setDocuments] = useState([]);
  const [question, setQuestion] = useState('Dobbelttjek de valgte poster mod de valgte krav. Hvad er uafklaret?');
  const [preview, setPreview] = useState(null), [answer, setAnswer] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const toggle = (values, set, id) => { set(values.includes(id) ? values.filter(v => v !== id) : [...values, id]); setPreview(null); };
  async function run(send) {
    setBusy(true); setError('');
    try {
      if (send) {
        const result = await api('cloud/send', 'POST', { ticket: preview.ticket, hash: preview.hash });
        setPreview(null); setAnswer(result.answer);
      } else {
        setPreview(await api('cloud/preview', 'POST', { provider, question, selection: { items, documents }, revision: state.revision }));
      }
    } catch(e) { setError(e.message); setPreview(null); }
    finally { setBusy(false); }
  }
  return <details className="provider-panel">
    <summary>Godkend afgrænset cloudtjek</summary>
    <p>Valgt model: {settings?.model}. Cloud sender kun de nedenfor valgte data efter din godkendelse.</p>
    {providers?.localOnly && <p>Virksomhedspolitik: lokal behandling er låst.</p>}
    {settings?.mode === 'cloud' && !providers?.localOnly && <>
<p>Udbyder: {providers?.choices?.find(p=>p.id===provider)?.name || provider}. Skift under AI-forbindelse ovenfor.</p>
      <p>{providers?.subscription}</p>
      <fieldset><legend>Vælg poster (maks. de første 40)</legend>{state.items.slice(0,40).map(i => <label key={i.id}><input type="checkbox" checked={items.includes(i.id)} onChange={() => toggle(items,setItems,i.id)} />{i.text}</label>)}</fieldset>
      <fieldset><legend>Vælg kilder</legend>{state.documents.map(d => <label key={d.id}><input type="checkbox" checked={documents.includes(d.id)} onChange={() => toggle(documents,setDocuments,d.id)} />{d.name} · s. {d.page}</label>)}</fieldset>
      <label>Spørgsmål<textarea aria-label="Spørgsmål til cloudtjek" maxLength={4000} value={question} onChange={e => {setQuestion(e.target.value);setPreview(null);}} /></label>
      <button disabled={busy} onClick={() => run(false)}>Vis præcis hvad der sendes</button>
      {preview && <div className="cloud-preview"><b>Modtager: {preview.destination}</b><p>Disse data forlader pc’en ved afsendelse. Intet er sendt endnu.</p><pre>{JSON.stringify(preview.payload,null,2)}</pre><button disabled={busy || !preview.ready} onClick={() => run(true)}>Send de viste data til cloud</button>{!preview.ready && <p>Kræver lokal opsætning af API-nøgle og model. Se installationsvejledningen.</p>}</div>}
      {answer && <p className="cloud-answer">{answer}</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
