// Nonblocking readiness cache: callers never wait for Ollama network I/O.
export function createModelReadiness({ settings, providers, request = fetch, now = Date.now }) {
  let cache = null;
  return function readiness() {
    const selected = settings();
    if (!selected.confirmed) return { ready:false, error:'Vaelg og gem en model foerst.', checking:false };
    const info = providers();
    if (selected.mode === 'cloud') {
      if (info.localOnly) return {ready:false,error:'Virksomhedspolitikken tillader kun lokal behandling.',checking:false};
      const provider = info.choices.find(p=>p.id===selected.provider);
      return provider?.ready ? {ready:true,error:'',checking:false} : {ready:false,error:provider?.error || 'Cloudnoegle mangler. Konfigurer udbyderens API-noegle i serverens miljoe og genstart.',checking:false};
    }
    const key = JSON.stringify(selected);
    if (!cache || cache.key !== key || (!cache.pending && now()-cache.checked >= 5000)) {
      const entry = {key,ready:false,error:'Kontrollerer Ollama og den valgte lokale model...',checking:true,pending:true,checked:now(),models:[]};
      cache = entry;
      Promise.resolve().then(async()=>{
        try {
          const response = await request('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});
          if (!response.ok) throw Error('Ollama svarede med HTTP '+response.status+'.');
          const body = await response.json();
          entry.models=Array.isArray(body.models)?[...new Set(body.models.map(m=>m.name).filter(name=>typeof name==='string'&&name.length>0&&name.length<=150))].slice(0,100):[];
          if (!Array.isArray(body.models) || !body.models.some(m=>m.name===selected.model)) throw Error('Den valgte lokale model er ikke installeret: '+selected.model+'.');
          entry.ready=true;entry.error='';
        } catch(e) {entry.ready=false;entry.error='Lokal model utilgaengelig. '+e.message;}
        finally {entry.pending=false;entry.checking=false;entry.checked=now();}
      });
    }
    return {ready:cache.ready,error:cache.error,checking:cache.checking,models:cache.models.map(name=>({name}))};
  };
}
