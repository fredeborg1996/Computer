import React, {useState} from 'react';
export function HistoryPanel({history,api,reload}) {
  const [folder,setFolder]=useState(''),[error,setError]=useState('');
  async function configure(){try{setError('');await api('history','POST',{folder});await reload();}catch(e){setError(e.message);}}
  return <section className="history-panel" aria-label="Automatisk historiksøgning">
    <strong>{history?.building ? 'Søger i tidligere kalkulationer…' : 'Lignende sager · automatisk'}</strong>
    <p>{history?.reason || 'Historik klargøres.'}</p>
    {history?.matches?.map((match,index)=><article key={match.file}>
      <b>{index+1}. {match.name}</b><small>Kilde: {match.file}</small>
      <p>Fælles arbejdsord: {match.shared.join(', ')}. Samlet lighed {match.score}%.</p>
      <ul>{match.examples.map(row=><li key={row.id}>{row.text} · {row.unit}</li>)}</ul>
      <p>{match.comparison?.quantities?.map(q=>`${q.type}: ${q.current} ${q.unit} nu / ${q.historical} ${q.unit} tidligere (×${q.factor}).`).join(" ")}</p><small>{match.warning}</small>
    </article>)}
    <small>{history?.indexed || 0} indekserede kalkulationsfiler · {history?.skipped || 0} afvist · {history?.duplicates || 0} kopier udeladt{history?.limited?' · søgegrænse nået':''}</small>
    {history?.error && <p role="alert">{history.error}</p>}
    <details><summary>Historikmappe og dækning</summary>
      <p>Der søges lokalt i Sigma .sig. .sit-skabeloner, PDF, Excel, vundne/tabte tilbud og efterkalkulationer er endnu ikke med. Deaktiverede poster bruges ikke. Søgningen opdateres ved nye poster og projektskift; indekset opdateres hver 15. minut. En helt tom sag afventer oplysninger.</p>
      <label>Historikmappe<input aria-label="Mappe med tidligere kalkulationer" value={folder} placeholder={history?.folder || 'C:\Tilbud\Tidligere sager'} onChange={e=>setFolder(e.target.value)} /></label>
      <button onClick={configure} disabled={!folder}>Brug denne historikmappe</button>
      <button disabled={history?.building || !history?.folder} onClick={async()=>{await api('history/rebuild','POST',{});await reload();}}>Opdatér indeks nu</button>
      {error && <p role="alert">{error}</p>}
    </details>
  </section>;
}
