import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { total, lineTotal } from "./engine.mjs";
import { ModelSettings } from "./ModelSettings.jsx";
import { ChatPanel } from './ChatPanel.jsx';
import "./style.css";
const panelOnly = new URLSearchParams(location.search).get("panel") === "1";
if (panelOnly) document.documentElement.dataset.panel = "true";
const money = (n) =>
  new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n);
async function api(url, method = "GET", body) {
  const r = await fetch("/api/" + url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b;
}
function CellInput({ value, onCommit, ...props }) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false),
    pending = useRef(null),
    last = useRef(value);
  useEffect(() => {
    last.current = value;
    if (!focused.current) setDraft(String(value));
  }, [value]);
  useEffect(() => () => clearTimeout(pending.current), []);
  function commit(text) {
    clearTimeout(pending.current);
    const next = props.type === "number" ? Number(text) : text;
    if (
      next !== last.current &&
      (!(props.type === "number") || Number.isFinite(next))
    ) {
      last.current = next;
      onCommit(next);
    }
  }
  return (
    <input
      {...props}
      value={draft}
      onFocus={() => (focused.current = true)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        clearTimeout(pending.current);
        pending.current = setTimeout(() => commit(text), 300);
      }}
      onBlur={() => {
        focused.current = false;
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function App() {
  const [data, setData] = useState(null),
    [health, setHealth] = useState(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("kontrol"),
    [source, setSource] = useState(null),
    [decision, setDecision] = useState(null),
    [reason, setReason] = useState(""),
    [saving, setSaving] = useState(false);
  const latest = useRef(null),
    saveQueue = useRef(Promise.resolve());
  const state = data?.state;
  useEffect(()=>{setSource(null);setDecision(null);},[state?.projectId,state?.mode]);
  const load = async () => {
    try {
      const [d, h] = await Promise.all([api("state"), api("health")]);
      setHealth(h);
      setData(d);
      latest.current = d.state;
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    const check = () =>
      api("health")
        .then(h => { setHealth(h); setData(d => d ? {...d, sigmaWatch:h.sigmaWatch, modelSettings:h.modelSettings, liveBridge:h.liveBridge} : d); })
        .catch(e => { setHealth(null); setError("Ingen forbindelse til serveren: " + e.message); });
    check();
    const interval = setInterval(check, 15000);
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      if (JSON.parse(e.data).revision >= (latest.current?.revision || 0))
        load();
    };
    return () => {
      clearInterval(interval);
      es.close();
    };
  }, []);
  function update(fn) {
    setSaving(true);
    saveQueue.current = saveQueue.current
      .then(async () => {
        const next = fn(structuredClone(latest.current));
        try {
          const d = await api("state", "PUT", next);
          latest.current = d.state;
          setData(previous => ({...previous, ...d}));
          setError("");
        } catch (e) {
          setError(e.message);
          await load();
        }
      })
      .finally(() => setSaving(false));
  }
  function item(id, key, value) {
    update((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, [key]: value } : i)),
    }));
  }
  async function importDocs(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const docs = JSON.parse(text);
      if (!Array.isArray(docs))
        throw Error("Brug en JSON-liste med dokumentuddrag. Se README.");
      update((s) => ({ ...s, documents: docs, decisions: [] }));
    } catch (e) {
      setError(e.message);
    }
  }
  if (!state)
    return <main className="loading"><h1>Tilbudsmakker</h1><p>{error ? "Serveren kunne ikke indlæses: " + error : "Åbner arbejdspladsen…"}</p><button className="secondary" onClick={load}>Prøv forbindelsen igen</button></main>;
  if (!data.modelSettings?.confirmed) return <main className="setup-screen"><ModelSettings firstRun settings={data.modelSettings} providers={data.providers} health={health} api={api} onSaved={load}/></main>;
  return (
    <>
      <header>
        <div className="brand">
          <span className="mark">m</span>
          <strong>
            MAK <span>Tilbudsassistent</span>
          </strong>
        </div>
        <div className="header-right">
          <span className="live-dot" /> Lokal arbejdsplads{" "}
          <span className="avatar">FH</span>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail">
          <div className="rail-active">▦</div>
          <button
            title="Vis udbudsmateriale"
            onClick={() => setTab("materiale")}
          >
            ▤
          </button>
          <button title="Vis afklaringer" onClick={() => setTab("afklaringer")}>
            ✓
          </button>
          <div className="rail-bottom">MAK</div>
        </nav>
        <main>
          <div className="breadcrumbs">
            Tilbud <span>/</span> CG Jensen <span>/</span>{" "}
            {state.mode === "demo" ? "Demonstrationssag" : "Sigma-forbindelse"}
          </div>
          <div className="title-row">
            <div>
              <h1>Et ekstra sæt øjne på tilbuddet.</h1>
              <p>Fra udbudskrav til kalkulation — mens du regner.</p>
            </div>
            <button className="secondary" onClick={() => window.print()}>
              Udskriv overblik ↗
            </button>
          </div>
          <div className="notice">
            <span>◈</span>
            <div>
              <b>
                {state.mode === "demo"
                  ? "Demonstrationskalkulation · " +
                    (state.documents.some((d) => d.id === "SAB-DEMO")
                      ? "konstruerede kilder"
                      : "indlæste dokumentuddrag")
                  : "Data modtaget fra Sigma"}
              </b>
              <span>
                {state.mode === "demo"
                  ? "Kalkulation og priser er eksempler. Se under Kilder, hvilke dokumentuddrag der bruges. Ingen original sag er ændret."
                  : "Kun indsendte snapshots kontrolleres. Indlæs sagens egne SAB/TAG. Ingen ændringer skrives tilbage til Sigma."}
              </span>
            </div>
          </div>
          <div className="split">
            <section className="estimate">
              <div className="section-title">
                <div>
                  <span className="small-label">KALKULATION</span>
                  <h2>{state.name}</h2>
                </div>
                <span className="version">Rev. {state.revision}</span>
              </div>
              <div className="toolbar">
                <span className="live-dot" />
                <b>{saving ? "Gemmer…" : state.mode === "demo" ? "Demoeditor" : "Seneste Sigma-snapshot"}</b>
                <span className="toolbar-detail">
                  {state.mode === "demo"
                    ? "Demoeditor"
                    : data.lastSigma
                      ? "Seneste snapshot " +
                        new Date(data.lastSigma).toLocaleTimeString("da-DK")
                      : "Sigma-snapshot indlæst tidligere · forbindelsen er ikke bekræftet"}
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Post</th>
                      <th>Beskrivelse</th>
                      <th>Mængde</th>
                      <th>Enh.</th>
                      <th>Enhedspris</th>
                      <th>I alt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.items.map((i) => (
                      <tr key={i.id}>
                        <td className="muted" title={i.countsTotal === false ? 'Underpost: indgår allerede i hovedpostens sum' : 'Hovedpost'}>{i.parentId ? '↳ ' : ''}{i.position || i.id}</td>
                        <td>
                          <CellInput
                            aria-label={"Beskrivelse " + i.id}
                            disabled={state.mode === "sigma"}
                            value={i.text}
                            onCommit={(value) => item(i.id, "text", value)}
                          />
                        </td>
                        <td>
                          <CellInput
                            aria-label={"Mængde " + i.id}
                            disabled={state.mode === "sigma"}
                            type="number"
                            min="0"
                            value={i.qty}
                            onCommit={(value) => item(i.id, "qty", value)}
                          />
                        </td>
                        <td>{i.unit}</td>
                        <td>
                          <CellInput
                            aria-label={"Enhedspris " + i.id}
                            disabled={state.mode === "sigma"}
                            type="number"
                            min="0"
                            value={i.price}
                            onCommit={(value) => item(i.id, "price", value)}
                          />
                        </td>
                        <td>{money(lineTotal(i))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state.mode === "demo" && (
                <button
                  className="add-row"
                  onClick={() =>
                    update((s) => ({
                      ...s,
                      items: [
                        ...s.items,
                        {
                          id: crypto.randomUUID().slice(0, 6),
                          text: "Ny post",
                          qty: 1,
                          unit: "stk.",
                          price: 0,
                        },
                      ],
                    }))
                  }
                >
                  + Tilføj kalkulationspost
                </button>
              )}
              <div className="total">
                <span>
                  Samlet kalkulation <small>ekskl. moms</small>
                </span>
                <strong>
                  {money(total(state.items))} <small>kr.</small>
                </strong>
              </div>
              <div className="assumptions">
                <div>
                  <h3>Arbejdsstedets forudsætninger</h3>
                  <p>Giv assistenten den viden, der ikke står i materialet.</p>
                </div>
                <label>
                  Afstand til lastbil{" "}
                  {state.distanceConfirmed === false ? "(uafklaret)" : ""}
                  <span>
                    <CellInput
                      aria-label="Afstand til lastbil"
                      type="number"
                      min="0"
                      value={state.distance}
                      onCommit={(distance) =>
                        update((s) => ({
                          ...s,
                          distance,
                          distanceConfirmed: true,
                        }))
                      }
                    />{" "}
                    m
                  </span>
                </label>
              </div>
              <div className="scenario">
                <span>PRØV I DEMOEN</span>
                <p>
                  Ret mængden. Afklar jordprøver. Sæt afstanden til 20 m og se
                  metodeforslaget ændre sig.
                </p>
                <button
                  onClick={async () => {
                    try {
                      const d = await api("reset", "POST");
                      latest.current = d.state;
                      setData(previous => ({...previous, ...d}));
                    } catch(e) { setError(e.message); }
                  }}
                >
                  Nulstil demosag ↺
                </button>
              </div>
              <div className="material-bottom">
                <span>▤</span>
                <div>
                  <b>Udbudsmaterialet er grundlaget</b>
                  <p>
                    Kontrollen omfatter kun indlæste uddrag. Tegninger,
                    rettelsesblade og øvrige krav skal også gennemgås.
                  </p>
                </div>
                <button onClick={() => setTab("materiale")}>Se kilder →</button>
              </div>
            </section>
            <ChatPanel key={state.mode + ':' + (state.projectId || state.name)} data={data} health={health} api={api} reload={load} update={update} tab={tab} setTab={setTab} setSource={setSource} setDecision={setDecision} setReason={setReason} importDocs={importDocs} />
          </div>
          <footer>
            <span>
              Sigma:{" "}
              {state.mode === "sigma"
                ? "snapshot modtaget · løbende celleændringer endnu ikke verificeret"
                : "ingen Sigma-data modtaget"}
            </span>
            <button
              onClick={() =>
                window.open(
                  "/?panel=1",
                  "mak-sigma-panel",
                  "width=440,height=900",
                )
              }
            >
              Åbn separat AI-sidepanel ↗
            </button>
            <span>Ingen automatisk afgivelse af tilbud</span>
          </footer>
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={load}>Forbind igen</button><button onClick={() => setError("")}>Luk</button>
            </div>
          )}
        </main>
      </div>
      {decision && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-label="Gem faglig afklaring"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim()) {
                update((s) => ({
                  ...s,
                  decisions: [
                    ...s.decisions,
                    {
                      fingerprint: decision.fingerprint,
                      reason: reason.trim(),
                      title: decision.title,
                      date: new Date().toISOString(),
                    },
                  ],
                }));
                setDecision(null);
              }
            }}
          >
            <button
              type="button"
              className="close"
              onClick={() => setDecision(null)}
            >
              Annuller ✕
            </button>
            <h2>{decision.title}</h2>
            <p>Hvor er kravet håndteret, eller hvorfor er metoden valgt?</p>
            <textarea
              aria-label="Din faglige afklaring"
              required
              maxLength={3000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button className="primary" type="submit">
              Gem afklaringen
            </button>
          </form>
        </div>
      )}
      {source && (
        <div className="modal-backdrop" onClick={() => setSource(null)}>
          <section
            className="modal"
            role="dialog"
            aria-label="Kildeuddrag"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close" onClick={() => setSource(null)}>
              Luk ✕
            </button>
            <span className="small-label">
              KILDEUDDRAG · {source.pageLabel||`SIDE ${source.page}`}
            </span>
            <h2>{source.name}</h2>
            <p className="quote">{source.text}</p>
            <small>{source.id} · Uddrag er ikke hele dokumentet.</small>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
