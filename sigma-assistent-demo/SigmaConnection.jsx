import React, { useState, useEffect } from 'react';
export function SigmaConnection({ info, api, reload, source }) {
  const [filename,setFilename] = useState(info?.filename || ''), [error,setError] = useState(''), [working,setWorking] = useState(false);
  useEffect(() => { if (info?.filename) setFilename(info.filename); }, [info?.filename]);
  async function configure(value) {
    setWorking(true); setError('');
    try { await api('sigma/watch','POST',{filename:value}); await reload(); }
    catch(e) { setError(e.message); }
    finally { setWorking(false); }
  }
  return <details className="provider-panel"><summary>Sigma-forbindelse · {info?.enabled ? 'følger gemt fil' : source === 'appscript' ? 'AppScript-snapshot' : source === 'com' ? 'COM-snapshot' : 'vælg kalkulation'}</summary>
    <p>Gemte ændringer læses lokalt hvert andet sekund. Originalfilen ændres ikke. Ændringer før “Gem” kræver COM- eller AppScript-broen på Sigma-pc’en.</p>
    <label>Fuld sti til Sigma-kalkulation<input aria-label="Sti til Sigma-kalkulation" value={filename} onChange={e => setFilename(e.target.value)} placeholder="C:\Tilbud\kalkulation.sig" /></label>
    <button disabled={working || !filename} onClick={() => configure(filename)}>Følg denne fil</button>{info?.enabled && <button disabled={working} onClick={() => configure('')}>Stop filovervågning</button>}
    <p>{info?.lastRead ? 'Senest læst: ' + new Date(info.lastRead).toLocaleTimeString('da-DK') : 'Ingen gemt fil læst endnu.'}</p>
    {(error || info?.error) && <p role="alert">{error || info.error}</p>}
  </details>;
}
