export const initial = () => ({
  name: "Vejforbindelse · demonstrationssag",
  revision: 1,
  mode: "demo",
  distance: 120,
  items: [
    {
      id: "01",
      text: "Udgravning og bortkørsel af jord",
      qty: 480,
      unit: "m³",
      price: 185,
    },
    {
      id: "02",
      text: "Levering og udlægning af muld",
      qty: 220,
      unit: "m³",
      price: 245,
    },
    { id: "03", text: "Dumper med fører", qty: 40, unit: "timer", price: 725 },
  ],
  documents: [
    {
      id: "SAB-DEMO",
      name: "SAB · Jordarbejder",
      page: 42,
      text: "DEMONSTRATIONSDATA. Ved bortkørsel af jord skal entreprenøren medregne prøvetagning og dokumentation. Arbejdet afregnes under særskilt post.",
    },
    {
      id: "TAG-DEMO",
      name: "TAG · Afregningsgrundlag",
      page: 18,
      text: "DEMONSTRATIONSDATA. Transport, midlertidig oplagring og nødvendige hjælpemidler skal være indeholdt i de relevante enhedspriser.",
    },
  ],
  decisions: [],
});
export const total = (items) =>
  Math.round(items.filter(i => i.countsTotal !== false).reduce((s, i) => s + lineTotal(i), 0) * 100) / 100;
export const lineTotal = i => i.priceBasis === 'Sigma-evaluated' ? i.lineTotal : i.qty * i.price;
// Compact change key, not an authentication/security hash.
function changeKey(text) {
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489917);
  }
  return (a >>> 0).toString(16) + (b >>> 0).toString(16) + ":" + text.length;
}
export function checks(state) {
  const alerts = [];
  const soil = state.items.some((i) => /jord|muld/i.test(i.text) && i.qty > 0);
  const source = state.documents.find((d) => /prøvetagning/i.test(d.text));
  if (
    soil &&
    source &&
    !state.items.some(
      (i) => /prøve|miljø|dokumentation/i.test(i.text) && i.qty > 0,
    )
  )
    alerts.push({
      id: "soil",
      kind: "Krav mangler",
      title: "Hov — er jordprøverne med?",
      body: "Der er jordarbejde i kalkulationen, men ingen tydelig post til prøvetagning og dokumentation. Det kan være indeholdt andetsteds; afklar det før tilbuddet afgives.",
      source: source.id,
      quote: source.text,
      action: "Tilføj post",
    });
  const dumper = state.items.find((i) => /dumper/i.test(i.text) && i.qty > 0);
  if (dumper)
    alerts.push({
      id: "dumper",
      kind: "Metodevalg",
      title:
        state.distanceConfirmed === false
          ? "Adgangsforhold skal afklares"
          : state.distance > 60
            ? "Dumperen kan være nødvendig"
            : "Kan dumperen undværes?",
      body:
        state.distanceConfirmed === false
          ? "Oplys afstand til lastbil og adgangsforhold. Metodevalg kan ikke vurderes ud fra kalkulationsposten alene."
          : state.distance > 60
            ? `Du har angivet ${state.distance} m fra arbejdssted til lastbil. Behold foreløbig dumperen; kapacitet, adgang og tidsforbrug skal afklares.`
            : `Ved ${state.distance} m kan direkte læsning være en mulighed. Posten er ${dumper.qty * dumper.price} kr. Besparelsen kræver, at adgang og alternativ produktionstid er bekræftet.`,
      source: state.documents.find((d) => d.id === "TAG-DEMO")?.id,
      quote: state.documents.find((d) => d.id === "TAG-DEMO")?.text,
    });
  if (state.items.some((i) => i.qty > 0 && i.price === 0))
    alerts.push({
      id: "unpriced",
      kind: "Prisgrundlag mangler",
      title: "En eller flere poster mangler pris",
      body: "En nulpris er ikke en kontrolleret enhedspris. Indhent dokumenteret prisgrundlag.",
    });
  if (!state.documents.length)
    alerts.push({
      id: "nodocs",
      kind: "Uafklaret",
      title: "Udbudsmateriale mangler",
      body: "Ingen SAB/TAG er indlæst. Kontrollen er ikke dækkende.",
    });
  return alerts
    .map((a) => ({
      ...a,
      fingerprint: changeKey(
        JSON.stringify([
          a.id,
          state.items,
          state.documents,
          state.distance,
          state.distanceConfirmed,
        ]),
      ),
    }))
    .filter(
      (a) => !state.decisions.some((d) => d.fingerprint === a.fingerprint),
    );
}
export function validate(s) {
  return (
    s &&
    typeof s.name === "string" &&
    s.name.length < 300 &&
    Array.isArray(s.items) &&
    s.items.length <= 1000 &&
    new Set(s.items.map((i) => i?.id)).size === s.items.length &&
    s.items.every(
      (i) =>
        typeof i.id === "string" &&
        typeof i.text === "string" &&
        i.text.length < 2000 &&
        typeof i.unit === "string" &&
        Number.isFinite(i.qty) &&
        i.qty >= 0 &&
        Number.isFinite(i.price) &&
        i.price >= 0,
        // optional Sigma evaluated fields are checked separately below
    ) &&
    s.items.every(i => (i.lineTotal === undefined || (Number.isFinite(i.lineTotal) && i.lineTotal >= 0)) && (i.costPrice === undefined || (Number.isFinite(i.costPrice) && i.costPrice >= 0))) &&
    Array.isArray(s.documents) &&
    s.documents.length <= 100 &&
    new Set(s.documents.map((d) => d?.id)).size === s.documents.length &&
    s.documents.every(
      (d) =>
        typeof d.id === "string" &&
        d.id.length < 200 &&
        typeof d.name === "string" &&
        typeof d.text === "string" &&
        d.text.length <= 100000 &&
        Number.isInteger(d.page) &&
        d.page > 0,
    ) &&
    Number.isFinite(s.distance) &&
    s.distance >= 0 &&
    Array.isArray(s.decisions) &&
    s.decisions.length <= 200 &&
    s.decisions.every(
      (d) =>
        typeof d.fingerprint === "string" &&
        typeof d.reason === "string" &&
        d.reason.length <= 3000,
    )
  );
}
