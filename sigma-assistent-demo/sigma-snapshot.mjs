// Version 2 retains Sigma's evaluated totals instead of rebuilding its formula engine.
export function normalizeSnapshot(input) {
  if (input.version !== undefined && ![1,2].includes(input.version)) throw Error('Ukendt Sigma-snapshotversion');
  if (input.version !== 2) return { name: input.name, items: input.items, projectId: typeof input.projectId === 'string' ? input.projectId : input.name, sourceVersion:1, sigmaSalesTotal:undefined,projectFile:'',sourceHash:'' };
  if (typeof input.projectId !== 'string' || !input.projectId || input.projectId.length > 1000 || !Array.isArray(input.items) || input.items.length > 1000) throw Error('Ugyldigt Sigma v2-projekt');
  const ids = new Set(input.items.map(i => i.id));
  if (ids.size !== input.items.length) throw Error('Dublerede Sigma-poster');
  const byId = new Map(input.items.map(i => [i.id, i]));
  const number = (row, key) => {
    if (!Number.isFinite(row[key]) || row[key] < 0) throw Error('Ugyldigt Sigma-tal: ' + key);
    return row[key];
  };
  const items = input.items.map(row => {
    if (typeof row.id !== 'string' || !row.id || typeof row.text !== 'string' || typeof row.unit !== 'string') throw Error('Ugyldig Sigma-post');
    let parent = row.parentId, seen = new Set([row.id]);
    if (parent !== null && typeof parent !== 'string') throw Error('parentId skal angives');
    while (parent !== null) {
      if (!ids.has(parent) || seen.has(parent)) throw Error('Ugyldigt eller cyklisk Sigma-hierarki');
      seen.add(parent); parent = byId.get(parent).parentId;
      if (parent !== null && typeof parent !== 'string') throw Error('Ugyldigt Sigma-hierarki');
    }
    return { id: row.id, parentId: row.parentId, text: row.text, unit: row.unit,
      qty: number(row,'quantity'), price: number(row,'unitSalesPrice'), costPrice: number(row,'costPrice'),
      lineTotal: number(row,'salesPrice'), countsTotal: row.parentId === null,
      priceBasis: 'Sigma-evaluated', position: String(row.position || '') };
  });
  const sum = Math.round(items.filter(i => i.countsTotal).reduce((n,i) => n + i.lineTotal,0)*100)/100;
  if (!Number.isFinite(input.salesTotal) || Math.abs(sum - input.salesTotal) > 0.02) throw Error('Sigma-summen stemmer ikke med hovedposterne. Snapshot afvist.');
  return { name: input.name, projectId: input.projectId, items, sigmaSalesTotal: input.salesTotal, sourceVersion: 2,
    projectFile: typeof input.projectFile === 'string' ? input.projectFile.slice(0,2000) : '', sourceHash: typeof input.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(input.sourceHash) ? input.sourceHash : '' };
}
