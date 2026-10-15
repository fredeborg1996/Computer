import React,{useState} from 'react';
const labels={loaded:'Indlæst',review:'Kræver valg',ambiguous:'Flere versioner · vælg én',excluded_version:'Version udeladt',unsupported:'Fundet · format læses ikke',too_large:'For stor',needs_ocr:'Kræver OCR',error:'Kunne ikke læses',page_limit:'Læsegrænse nået'};
export function CaseDocumentsPanel({info,state,api,reload}) {
  const [folder,setFolder]=useState(''),[selected,setSelected]=useState([]),[error,setError]=useState('');
  async function act(action,body={}){try{setError('');await api('documents/'+action,'POST',{...body,revision:state.revision});await reload();}catch(e){setError(e.message);}}
  return <section aria-label="Automatiske sagskilder"><b>{info?.busy?'Finder sagens filer…':'Automatiske sagskilder'}</b>
    <p>{info?.folder||'Gem kalkulationen i sagsmappen, så søger jeg dér.'}</p>
    <p>{info?.loadedPages||0} læste sider/tekstafsnit. PDF, DOCX og TXT kan læses; øvrige formater vises som fundne.</p>
    {info?.warnings?.map((w,i)=><p key={i}>{w}</p>)}
    {info?.files?.map(f=><label className="doc" key={f.id}><input type="checkbox" disabled={info.busy||['unsupported','too_large'].includes(f.status)} checked={selected.includes(f.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,f.id]:s.filter(id=>id!==f.id))}/>{f.relative} · {labels[f.status]||f.status}</label>)}
    <button disabled={info?.busy||!selected.length} onClick={()=>act('select',{ids:selected})}>Brug valgte filer</button>
    <button disabled={info?.busy||state.mode!=='sigma'} onClick={()=>act('refresh')}>Søg igen</button>
    <details><summary>Vælg sagsmappe ved behov</summary><input aria-label="Sagsmappe" placeholder="C:\\Sager\\Aktuel sag" value={folder} onChange={e=>setFolder(e.target.value)}/><button disabled={!folder||info?.busy} onClick={()=>act('folder',{folder})}>Brug sagsmappen</button></details>
    {(error||info?.error)&&<p role="alert">{error||info.error}</p>}
  </section>;
}
