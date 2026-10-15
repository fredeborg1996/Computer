import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { initial } from "./engine.mjs";
import { createConversation } from './conversation.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mak-sigma-api-"));
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: import.meta.dirname,
  env: {
    ...process.env,
    PORT: "4318",
    SIGMA_DATA_DIR: dir,
    SIGMA_AUTOREVIEW: "0",
  },
  stdio: "pipe",
});
const url = "http://127.0.0.1:4318";
async function call(endpoint, method = "GET", body, headers = {}) {
  return fetch(url + endpoint, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}
try {
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    setTimeout(() => reject(Error("Server start timeout")), 5000).unref();
  });
  assert.equal(
    (await call("/api/sigma/snapshot", "POST", { name: "Test", items: [] }))
      .status,
    401,
  );
  assert.equal(
    (
      await call("/api/state", "GET", null, {
        Origin: "https://unknown.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/auto", "POST", { enabled: false })).status,
    200,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, "settings.json"))).autoEnabled,
    false,
  );
  const s = (await (await call("/api/state")).json()).state;
  assert.equal(
    (
      await call("/api/state", "PUT", {
        ...s,
        items: [{ ...s.items[0], qty: -1 }],
      })
    ).status,
    400,
  );
  const saved = await call("/api/state", "PUT", { ...s, distance: 20 });
  assert.equal(saved.status, 200);
  assert.equal((await call("/api/state", "PUT", s)).status, 409);
  const token = fs.readFileSync(path.join(dir, "bridge-token.txt"), "utf8");
  const headers = { Authorization: "Bearer " + token };
  assert.equal(
    (
      await call(
        "/api/sigma/snapshot",
        "POST",
        { name: "Sigma A", items: initial().items },
        headers,
      )
    ).status,
    200,
  );
  let live = (await (await call("/api/state")).json()).state;
  assert.equal(live.mode, "sigma");
  assert.equal(live.documents.length, 0);
  const cloud = await (await call('/api/cloud/preview','POST',{revision:live.revision,provider:'openai',question:'Test',selection:{items:['01'],documents:[]}})).json();
  assert(cloud.ticket); assert.equal(cloud.destination,'api.openai.com');
  assert.equal(cloud.payload.DATA.items.length,1); assert.equal(cloud.payload.DATA.name,undefined);
  await call('/api/reset','POST',{});
  assert.equal((await call('/api/cloud/send','POST',{ticket:cloud.ticket,hash:cloud.hash})).status,409);
  assert.equal((await call('/api/cloud/send','POST',{ticket:cloud.ticket,hash:cloud.hash})).status,409);
  assert.equal((await call('/api/sigma/watch','POST',{filename:'relative.sig'})).status,400);
  assert.equal(live.distanceConfirmed, false);
  live = (await (await call('/api/state')).json()).state;
  live.documents = initial().documents;
  assert.equal((await call("/api/state", "PUT", live)).status, 200);
  await call(
    "/api/sigma/snapshot",
    "POST",
    { name: "Sigma B", items: initial().items },
    headers,
  );
  live = (await (await call("/api/state")).json()).state;
  assert.equal(live.documents.length, 0);
  const fixture = path.join(dir,'test.sig');
  const xml = amount => `<SigmaFile FileType="SIGPROJ" FileSaveVersion="41"><ProjectData><ComponentData><Component><Level>0</Level><SalesPrice>${amount}</SalesPrice><Component><Name>Syntetisk post</Name><Unit>m3</Unit><Amount>200</Amount><UnitSalesPrice>379.8</UnitSalesPrice><SalesPrice>75960</SalesPrice><CostPrice>60000</CostPrice></Component></Component></ComponentData></ProjectData></SigmaFile>`;
  fs.writeFileSync(fixture,xml(75960));
  assert.equal((await call('/api/sigma/watch','POST',{filename:fixture})).status,200);
  async function until(check) {
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){const data=await (await call('/api/state')).json();if(check(data))return data;await new Promise(r=>setTimeout(r,200));}
    throw Error('Sigma file watch timeout');
  }
  const read = await until(d=>d.state.sourceVersion===2);
  assert.equal(read.state.items[0].lineTotal,75960);
  assert.equal(read.state.sigmaSource,'saved-file');
  const revision=read.state.revision;
  fs.writeFileSync(fixture,xml(0));
  const refused=await until(d=>!!d.sigmaWatch.error);
  assert.equal(refused.state.revision,revision);
  fs.writeFileSync(fixture,xml(75960).replace('Syntetisk post','Syntetisk rettet post'));
  const corrected=await until(d=>d.state.revision>revision);
  assert.equal(corrected.sigmaWatch.error,'');
  assert.equal(corrected.state.items[0].text,'Syntetisk rettet post');
  assert.equal((await call('/api/sigma/watch','POST',{filename:''})).status,200);
  const archive=path.join(dir,'historik');fs.mkdirSync(archive);
  fs.writeFileSync(path.join(archive,'Tidligere regnvand.sig'),xml(75960).replace('Syntetisk post','Udgravning regnvandsledning i vej'));
  fs.writeFileSync(path.join(archive,'Tidligere asfalt.sig'),xml(75960).replace('Syntetisk post','Fræsning asfalt belægning vej'));
  fs.copyFileSync(path.join(archive,'Tidligere regnvand.sig'),path.join(archive,'Kopi regnvand.sig'));
  assert.equal((await call('/api/history','POST',{folder:archive})).status,200);
  await until(d=>d.history.indexed===2 && !d.history.building);
  const blank={version:2,projectId:'unsaved:A',projectFile:'',name:'Ny kalkulation',salesTotal:0,items:[],sourceKind:'com'};
  assert.equal((await call('/api/sigma/snapshot','POST',blank,headers)).status,200);
  let automatic=await (await call('/api/state')).json();
  assert.equal(automatic.history.status,'waiting');assert.equal(automatic.history.matches.length,0);
  const row=text=>({id:'1',parentId:null,text,unit:'m',quantity:200,unitSalesPrice:379.8,salesPrice:75960,costPrice:60000});
  await call('/api/sigma/snapshot','POST',{...blank,salesTotal:75960,items:[row('Udgravning regnvandsledning i vej')]},headers);
  automatic=await (await call('/api/state')).json();
  assert(automatic.history.matches[0].name.toLowerCase().includes('regnvand'));
  assert(automatic.chat.some(m=>m.kind==='scan'&&m.text.includes('søger efter lignende')));
  assert(automatic.chat.some(m=>m.kind==='history'&&m.text.includes('tidligere tilbud, der kan være relevant')));
  assert.equal(automatic.chat.filter(m=>m.kind==='check'&&m.text.includes('Udbudsmateriale mangler')).length,1);
  const scanCount=automatic.chat.filter(m=>m.kind==='scan').length;
  await call('/api/sigma/snapshot','POST',{...blank,salesTotal:75960,items:[row('Udgravning regnvandsledning i vej')]},headers);
  automatic=await (await call('/api/state')).json();
  assert.equal(automatic.chat.filter(m=>m.kind==='scan').length,scanCount);
  assert.equal(automatic.history.duplicates,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'latest-history-matches.json'))).revision,automatic.state.revision);
  // Same visible title, different new project: no old source/decision leakage.
  let prior=automatic.state;prior.documents=initial().documents;await call('/api/state','PUT',prior);
  await call('/api/sigma/snapshot','POST',{...blank,projectId:'unsaved:B',salesTotal:75960,items:[row('Fræsning asfalt belægning vej')]},headers);
  automatic=await (await call('/api/state')).json();
  assert.equal(automatic.state.documents.length,0);
  assert(automatic.history.matches[0].name.toLowerCase().includes('asfalt'));
  assert(!automatic.history.matches.some(m=>m.name.toLowerCase().includes('regnvand')));
  assert(!automatic.chat.some(m=>m.kind==='history'&&m.text.toLowerCase().includes('regnvand')));
  // Background matches ran without a browser and without enabling automatic model calls.
  assert.equal(automatic.autoEnabled,false);
  const savedB={...blank,projectId:'unsaved:B',projectFile:fixture,salesTotal:75960,items:[row('Fræsning asfalt belægning vej')]};
  await call('/api/sigma/snapshot','POST',savedB,headers);
  let savedState=(await (await call('/api/state')).json()).state;
  savedState.documents=initial().documents;await call('/api/state','PUT',savedState);
  await call('/api/sigma/snapshot','POST',{...savedB,projectId:'com:after-restart',name:'Omdøbt projekt'},headers);
  assert.equal((await (await call('/api/state')).json()).state.documents.length,2);
  const finalState=(await (await call('/api/state')).json()).state;
  assert(createConversation(dir).list(finalState).some(m=>m.kind==='scan'));
  const caseFolder=path.join(dir,'Synthetic school');fs.mkdirSync(caseFolder);
  const caseFile=path.join(caseFolder,'School.sig');fs.writeFileSync(caseFile,'synthetic file locator');
  fs.writeFileSync(path.join(caseFolder,'SAB.txt'),'Jordarbejde skal dokumenteres før opstart.');
  await call('/api/sigma/snapshot','POST',{...savedB,projectId:'source-case',projectFile:caseFile},headers);
  async function waitSources(predicate){for(let n=0;n<80;n++){const result=await (await call('/api/state')).json();if(!result.caseDocuments.busy&&predicate(result))return result;await new Promise(r=>setTimeout(r,100));}throw Error('Document discovery timeout');}
  let found=await waitSources(x=>x.state.documents.some(d=>d.origin==='auto-case'));
  assert.equal(found.state.documents.length,1);assert(found.state.documents[0].pageLabel.includes('Tekstafsnit'));
  assert(found.chat.some(m=>m.kind==='documents'&&m.text.includes('SAB.txt')));
  const originalId=found.state.documents[0].id;
  fs.writeFileSync(path.join(caseFolder,'SAB.txt'),'Jordarbejde og prøver skal dokumenteres før opstart.');
  await call('/api/documents/refresh','POST',{revision:found.state.revision});
  found=await waitSources(x=>x.state.documents[0]?.id!==originalId);
  assert(!found.state.documents.some(d=>d.id===originalId));
  for(const v of [1,2])fs.writeFileSync(path.join(caseFolder,'TAG v'+v+'.txt'),'Afregning af jordarbejder.');
  await call('/api/documents/refresh','POST',{revision:found.state.revision});
  found=await waitSources(x=>x.caseDocuments.files.filter(f=>f.status==='ambiguous').length===2);
  const chosen=found.caseDocuments.files.find(f=>f.status==='ambiguous').id;
  await call('/api/documents/select','POST',{revision:found.state.revision,ids:[chosen]});
  found=await waitSources(x=>x.state.documents.length===2);
  assert.equal(found.caseDocuments.files.filter(f=>f.status==='excluded_version').length,1);
  console.log(
    "API PASS: auth, origin, conflicts, one-use cloud preview, file watch/recovery; new unsaved estimate waits then finds history automatically; same-title project switch updates matches and clears sources; duplicate exclusion; no browser or model calls.",
  );
} finally {
  child.kill();
  await new Promise((r) => child.once("exit", r));
  fs.rmSync(dir, { recursive: true, force: true });
}
