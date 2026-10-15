export const answerSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, quote: { type: "string" } },
        required: ["id", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["answer", "sources"],
  additionalProperties: false,
};
export function groundAnswer(raw, documents) {
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    return "Uafklaret: modellen leverede ikke et kontrollerbart svar.";
  }
  if (typeof result.answer !== "string" || !Array.isArray(result.sources))
    return "Uafklaret: modellens svarformat kunne ikke kontrolleres.";
  const valid = result.sources.filter(
    (s) =>
      typeof s.quote === "string" &&
      s.quote.trim().length >= 15 &&
      documents.some((d) => d.id === s.id && d.text.includes(s.quote)),
  );
  if (documents.length && !valid.length)
    return "Uafklaret: modellen gav ingen kildehenvisning med et ordret uddrag, der kunne genfindes. Brug kildevisningen til at afklare spørgsmålet.";
  const refs = valid.map((s) => {
    const d = documents.find((d) => d.id === s.id);
    return d.id + " · " + (d.pageLabel || "PDF-side " + d.page) + ": “" + s.quote + "”";
  });
  return (
    result.answer.slice(0, 5000) +
    (refs.length
      ? "\n\nKildeuddrag:\n" + [...new Set(refs)].join("\n")
      : "\n\nIntet dokumentgrundlag indlæst.")
  );
}
