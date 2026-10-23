import { total, checks, lineTotal } from "./engine.mjs";
import { caseSnapshot } from './chat-scope.mjs';
// Bounded lexical retrieval. No document is treated as an instruction.
export function contextFor(state, question) {
  state = caseSnapshot(state);
  // A named section must not be crowded out by earlier sections in the tree.
  const normalized = value => String(value || '').toLocaleLowerCase('da').replace(/\s+/g, ' ').trim();
  const query = normalized(question);
  const parentIds = new Set(state.items.map(item => item.parentId).filter(Boolean));
  const sections = state.items.filter(item => parentIds.has(item.id) && normalized(item.text).length >= 8 && query.includes(normalized(item.text)));
  const scopeIds = new Set(sections.map(item => item.id));
  const scopedItems = sections.length ? state.items.filter(item => {
    if (scopeIds.has(item.id) || scopeIds.has(item.parentId)) { scopeIds.add(item.id); return true; }
    return false;
  }) : state.items;
  const words =
    question
      .toLowerCase()
      .match(/[a-zæøå]{4,}/g) || [];
  const terms = [...new Set(words)];
  const relevantItems = sections.length || !terms.length ? scopedItems : scopedItems
    .map((item,index)=>({item,index,score:terms.reduce((n,w)=>n+(normalized(item.text).includes(w)?1:0),0)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.item);
  const ranked = state.documents
    .map((d, index) => ({
      d,
      index,
      score: terms.reduce(
        (n, w) => n + (d.text.toLowerCase().includes(w) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const documents = [];
  let chars = 0;
  for (const { d } of ranked) {
    const text = d.text.slice(0, Math.min(3200, 12000 - chars));
    if (!text) break;
    documents.push({ ...d, text });
    chars += text.length;
    if (chars >= 12000 || documents.length >= 6) break;
  }
  return {
    name: state.name,
    mode: state.mode,
    revision: state.revision,
    items: relevantItems.slice(0, 40).map((i) => ({
      ...i,
      text: i.text.slice(0, 220),
      lineTotal: Math.round(lineTotal(i) * 100) / 100,
    })),
    itemCoverage: {
      loaded: state.items.length,
      provided: Math.min(40, scopedItems.length),
      partial: scopedItems.length < state.items.length || scopedItems.length > 40,
      scope: sections.length ? 'named-section' : 'calculation-start',
    },
    total: total(state.items),
    distance: state.distance,
    documents,
    documentCoverage: {
      loaded: state.documents.length,
      provided: documents.length,
      partial: true,
      method: "keyword excerpts; not exhaustive",
    },
    decisions: state.decisions
      .slice(-5)
      .map((d) => ({ reason: d.reason.slice(0, 500), title: d.title })),
    checks: checks(state).map(({ fingerprint, quote, ...a }) => ({
      ...a,
      quote: quote?.slice(0, 500),
    })),
  };
}
