import test from "node:test";
import assert from "node:assert/strict";
import { initial, checks, total, validate } from "./engine.mjs";
import { groundAnswer } from "./grounding.mjs";
import { contextFor } from "./context.mjs";
import { normalizeSnapshot } from './sigma-snapshot.mjs';
import { providerInfo, cloudPayload, cloudAsk } from './providers.mjs';
import { similarCases } from './history.mjs';
import {caseProfile,compareProfiles} from './case-profile.mjs';

test('Historisk mængdegrundlag undgår ressourcedobling og holder ukendte forhold åbne',()=>{
  const profile=caseProfile([{id:'a',text:'Regnvandsledning',unit:'m',qty:100},{id:'b',parentId:'a',text:'Regnvandsrør',unit:'m',qty:1}]);
  assert.equal(profile.measures[0].quantity,100);
  const near=compareProfiles(profile,caseProfile([{id:'x',text:'Regnvandsledning',unit:'lbm',qty:110}]));
  const far=compareProfiles(profile,caseProfile([{id:'x',text:'Regnvandsledning',unit:'m',qty:1000}]));
  assert.ok(near.quantityScore>far.quantityScore);
  assert.equal(profile.access,'ukendt');
  assert.equal(compareProfiles(profile,caseProfile([{id:'z',text:'Regnvandsledning',unit:'m'}])).quantityScore,null);
  assert.equal(compareProfiles(profile,caseProfile([{id:'z',text:'Asfalt fræsning',unit:'m2',qty:100}])).conflict,true);
});

test('Historik: tom ny sag afventer, relevante arbejdsarter findes, egen fil udelades',()=>{
  const cases=[
    {name:'Regnvandskloak ved skole',file:'C:/Tilbud/old-a.sig',relative:'old-a.sig',hash:'a',rows:[{id:'1',text:'Udgravning regnvandsledning i vej',unit:'m',qty:100,price:500}]},
    {name:'Asfaltarbejder i boligvej',file:'C:/Tilbud/old-b.sig',hash:'b',rows:[{id:'1',text:'Fræsning asfalt belægning vej',unit:'m2',qty:200,price:100}]},
  ];
  assert.equal(similarCases({name:'Ny kalkulation',items:[]},cases).status,'waiting');
  const state={name:'Ny kalkulation',items:[{text:'Udgravning regnvandsledning i vej'}]};
  assert.equal(similarCases(state,cases).matches[0].name,cases[0].name);
  assert(!similarCases({...state,projectFile:'c:\\tilbud\\old-a.sig'},cases).matches.some(m=>m.name===cases[0].name));
  assert(!similarCases({...state,sourceHash:'a'},cases).matches.some(m=>m.name===cases[0].name));
  assert(!similarCases({...state,projectFile:'C:/Tilbud/copy.sig'},[{...cases[0],aliases:[{file:'C:/Tilbud/copy.sig',hash:'copy'}]}]).matches.length);
  assert.equal(similarCases({name:'Ny kalkulation',items:[{text:'Murværk tegl facade'}]},cases).matches.length,0);
});

test('Sigma: ressourcer tælles ikke dobbelt, og evaluerede afrundinger bevares', () => {
  const input = {version:2, name:'Test', projectId:'test:1', salesTotal:23300.61, items:[
    {id:'1',parentId:null,text:'Aktivitet',unit:'m2',quantity:300,unitSalesPrice:77.67,salesPrice:23300.61,costPrice:19000},
    {id:'1.1',parentId:'1',text:'Maskine',unit:'time',quantity:2,unitSalesPrice:500,salesPrice:1000,costPrice:800},
  ]};
  const s = normalizeSnapshot(input);
  assert.equal(total(s.items),23300.61);
  assert.equal(s.items[1].costPrice,800);
  assert.equal(s.items[1].countsTotal,false);
  assert.throws(() => normalizeSnapshot({...input,salesTotal:23301}), /stemmer ikke/);
  assert.throws(() => normalizeSnapshot({...input,items:input.items.map(i=>({...i,parentId:'1.1'}))}), /hierarki/);
});
test('Manglende subtotal på 75.960 afvises; rettet sum accepteres', () => {
  const row = (id,total) => ({id,parentId:null,text:'Test',unit:'sum',quantity:1,unitSalesPrice:total,salesPrice:total,costPrice:total});
  const b = {version:2,name:'Test',projectId:'subtotal',salesTotal:30000,items:[row('1',30000),row('2',75960)]};
  assert.throws(()=>normalizeSnapshot(b), /stemmer ikke/);
  assert.equal(total(normalizeSnapshot({...b,salesTotal:105960}).items),105960);
});
test('Cloud: kun valgte data, ingen sagsnavn eller uvalgte priser', () => {
  const payload=cloudPayload('Kontrollér',contextFor(initial(),'Kontrollér'),{items:['01'],documents:['SAB-DEMO']});
  assert.equal(payload.DATA.items.length,1); assert.equal(payload.DATA.documents.length,1);
  assert.equal(payload.DATA.name,undefined); assert.equal(payload.DATA.total,undefined);
  assert(!JSON.stringify(payload).includes('Dumper'));
  assert(!JSON.stringify(providerInfo({OPENAI_API_KEY:'never-output',SIGMA_OPENAI_MODEL:'test'})).includes('never-output'));
});
test('Cloud: firmalås og fejl giver intet alternativt kald', async () => {
  let calls=0;const request=async()=>{calls++;return {ok:false,status:429};};
  await assert.rejects(cloudAsk('openai',{}, {SIGMA_LOCAL_ONLY:'1',OPENAI_API_KEY:'fake',SIGMA_OPENAI_MODEL:'test'},request), /kun lokal/);
  assert.equal(calls,0);
  await assert.rejects(cloudAsk('openai',{}, {OPENAI_API_KEY:'fake',SIGMA_OPENAI_MODEL:'test'},request), /429/);
  assert.equal(calls,1);
});
test('Cloud: officielle API-adaptere sender afgrænset payload og læser tekst', async () => {
  for (const id of ['openai','anthropic']) {
    const env={OPENAI_API_KEY:'fake',SIGMA_OPENAI_MODEL:'test',ANTHROPIC_API_KEY:'fake',SIGMA_ANTHROPIC_MODEL:'test'};
    const text=await cloudAsk(id,{question:'Test',DATA:{items:[]}},env,async(url,options)=>{
      assert.match(url,/^https:\/\/api\.(openai|anthropic)\.com\//);
      const body=JSON.parse(options.body); if(id==='openai')assert.equal(body.store,false);
      return {ok:true,json:async()=>id==='openai'?{output:[{content:[{type:'output_text',text:'answer'}]}]}:{content:[{type:'text',text:'answer'}]}};
    });assert.equal(text,'answer');
  }
});
test("jordkrav opdages og henviser til faktisk uddrag", () => {
  const s = initial();
  const a = checks(s).find((a) => a.id === "soil");
  assert.equal(a.source, "SAB-DEMO");
  assert.equal(a.quote, s.documents[0].text);
  assert.equal(total(s.items), 171700);
});
test("afklaring bortfiltreres kun for samme datagrundlag", () => {
  const s = initial(),
    a = checks(s)[0];
  s.decisions.push({
    fingerprint: a.fingerprint,
    reason: "Indeholdt i post 02",
  });
  assert(!checks(s).some((x) => x.id === a.id));
  s.documents[0].text += " Nyt rettelsesblad.";
  assert(checks(s).some((x) => x.id === a.id));
});
test("modelgrundlaget kan ikke være uden valide mængder eller kilder", () => {
  const s = initial();
  assert(validate(s));
  s.items[0].qty = -1;
  assert(!validate(s));
  s.items[0].qty = 480;
  s.documents[0].page = 0;
  assert(!validate(s));
});
test("metodevalg følger adgangsforudsætningen", () => {
  const s = initial();
  assert.match(checks(s).find((a) => a.id === "dumper").title, /nødvendig/);
  s.distance = 20;
  assert.match(checks(s).find((a) => a.id === "dumper").title, /undværes/);
});
test("manglende materiale giver uafklaret, ingen falsk jordprøvehenvisning", () => {
  const s = initial();
  s.documents = [];
  assert(checks(s).some((a) => a.id === "nodocs"));
  assert(!checks(s).some((a) => a.id === "soil"));
});
test("opfundne kildecitater afvises", () => {
  assert.match(
    groundAnswer(
      JSON.stringify({
        answer: "Alt ok",
        sources: [{ id: "SAB-DEMO", quote: "Alle jordprøver er gratis" }],
      }),
      initial().documents,
    ),
    /^Uafklaret/,
  );
});
test("ordret kilde kan genfindes og får faktisk sidenummer", () => {
  const d = initial().documents;
  assert.match(
    groundAnswer(
      JSON.stringify({
        answer: "Afklar prøvetagning.",
        sources: [
          {
            id: d[0].id,
            quote:
              "Ved bortkørsel af jord skal entreprenøren medregne prøvetagning og dokumentation.",
          },
        ],
      }),
      d,
    ),
    /PDF-side 42/,
  );
});
test("modelkontekst begrænses og markerer delvis dækning", () => {
  const s = initial();
  s.documents = Array.from({ length: 30 }, (_, i) => ({
    id: "D" + i,
    name: "SAB",
    page: i + 1,
    text: "jordarbejde ".repeat(2000),
  }));
  const c = contextFor(s, "jordarbejde");
  assert(c.documents.reduce((n, d) => n + d.text.length, 0) <= 12000);
  assert.equal(c.documentCoverage.partial, true);
  assert.equal(c.total, 171700);
});
