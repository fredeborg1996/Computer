import { total, checks, lineTotal } from "./engine.mjs";
// Bounded lexical retrieval. No document is treated as an instruction.
export function contextFor(state, question) {
  const words =
    (question + " " + state.items.map((i) => i.text).join(" "))
      .toLowerCase()
      .match(/[a-zæøå]{4,}/g) || [];
  const terms = [...new Set(words)];
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
    items: state.items.slice(0, 40).map((i) => ({
      ...i,
      text: i.text.slice(0, 220),
      lineTotal: Math.round(lineTotal(i) * 100) / 100,
    })),
    itemCoverage: {
      loaded: state.items.length,
      provided: Math.min(40, state.items.length),
      partial: state.items.length > 40,
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
