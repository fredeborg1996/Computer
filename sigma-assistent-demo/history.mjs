import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {caseProfile,compareProfiles} from './case-profile.mjs';
const execute = promisify(execFile);
const stop = new Set('den det der med fra til som for ved under over efter samt eller ikke skal være bliver alle nyt ny nye kalkulation tilbud sag sager projekt demonstration demonstrationssag sum stk timer'.split(' '));
const canonical = word => word.replace(/^(kloak|udgrav|belæg|asfalt|regnvand|spildevand|afvand|beton|jordarbejd|bortkør|dræn).*/, '$1');
export function terms(text) { return new Set((String(text).toLowerCase().match(/[a-zæøå]{3,}/g)||[]).filter(t=>!stop.has(t)).map(canonical)); }
const fileKey = value => String(value||'').replaceAll('\\','/').toLowerCase();

export function similarCases(state, cases) {
  const currentProfile=caseProfile(state.items);
  const query = terms(state.name + ' ' + state.items.map(i=>i.text).join(' '));
  if(query.size < 2) return { status:'waiting', reason:'Tilføj en beskrivende titel eller kalkulationsposter. En tom sag giver ikke et fagligt sammenligningsgrundlag.', matches:[] };
  const queryFile = fileKey(state.projectFile || (state.projectId?.startsWith('file:') ? state.projectId.slice(5) : ''));
  const catalog = cases.map(c=>({c,tokens:terms(c.name+' '+c.rows.map(r=>r.text).join(' '))}));
  const frequency = new Map();
  for(const {tokens} of catalog) for(const t of tokens)frequency.set(t,(frequency.get(t)||0)+1);
  const weight = t=>1+Math.log(1+catalog.length/((frequency.get(t)||0)+1));
  const queryWeight = [...query].reduce((n,t)=>n+weight(t),0);
  const matches = [];
  for(const {c,tokens} of catalog) {
    if(fileKey(c.file)===queryFile || (state.sourceHash && state.sourceHash===c.hash) || c.aliases?.some(a=>fileKey(a.file)===queryFile || (state.sourceHash && state.sourceHash===a.hash))) continue;
    const shared=[...query].filter(t=>tokens.has(t));
    if(shared.length<2)continue;
    const textScore = shared.reduce((n,t)=>n+weight(t),0)/queryWeight;
    if(textScore<0.12)continue;
    const comparison=compareProfiles(currentProfile,caseProfile(c.rows));
    if(comparison.conflict)continue;
    let points=textScore*0.55,weights=0.55;
    if(comparison.typeScore!==null){points+=comparison.typeScore*0.25;weights+=0.25;}
    if(comparison.quantityScore!==null){points+=comparison.quantityScore*0.2;weights+=0.2;}
    const score=points/weights;
    const examples=c.rows.map(r=>({r,overlap:[...terms(r.text)].filter(t=>query.has(t)).length})).filter(x=>x.overlap>0).sort((a,b)=>b.overlap-a.overlap).slice(0,3).map(x=>x.r);
    matches.push({ name:c.name, file:c.relative || c.file, score:Math.round(score*100), shared:shared.slice(0,10), examples,comparison,
      warning:'Rangeret efter arbejdsord, opgavetyper og sammenlignelige mængder. Adgangsforhold, prisniveau og udfald er ukendte. Ingen pris er valideret.' });
  }
  matches.sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
  return {status:'done',reason:matches.length?'Lokale kandidater fundet. Ingen pris er godkendt eller genbrugt automatisk.':'Ingen tilstrækkeligt lignende sag i det indekserede materiale.',matches:matches.slice(0,3)};
}

export function createHistory(root,data,changed) {
  const setting=path.join(data,'history-settings.json'), cache=path.join(data,'history-index.json');
  const defaultFolder=path.join(os.homedir(),'OneDrive - Midtsjælland Anlæg & Kloak','Sagsstyring');
  let folder=process.env.SIGMA_HISTORY_ROOT || (process.env.SIGMA_DATA_DIR ? '' : fs.existsSync(defaultFolder)?defaultFolder:'');
  let index={cases:[],errors:[],scanned:0,duplicates:0,limited:false}, building=false, generation=0, timer, lastBuilt=null, error='';
  try {folder=JSON.parse(fs.readFileSync(setting)).folder;}catch{}
  try {const saved=JSON.parse(fs.readFileSync(cache));if(saved.version===3 && saved.folder===folder){index=saved.index;lastBuilt=saved.lastBuilt;}}catch{}
  async function build() {
    if(!folder || building)return;
    building=true;const current=generation,target=folder;changed();
    try {
      const bundled=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
      const python=process.env.SIGMA_PYTHON || (fs.existsSync(bundled)?bundled:'python.exe');
      const {stdout}=await execute(python,[path.join(root,'index-history.py'),target],{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
      if(generation!==current)return;
      index=JSON.parse(stdout);lastBuilt=new Date().toISOString();error='';
      fs.writeFileSync(cache+'.tmp',JSON.stringify({version:3,folder,index,lastBuilt}));fs.renameSync(cache+'.tmp',cache);
    } catch(e) {if(generation===current)error=(e.stderr||e.message).slice(0,700);}
    finally {building=false;changed();if(current!==generation && folder)queueMicrotask(build);}
  }
  const interval=setInterval(build,15*60*1000);interval.unref();
  timer=setTimeout(build,500);timer.unref();
  return {
    info:()=>({folder,building,lastBuilt,error,indexed:index.cases.length,scanned:index.scanned,skipped:index.errors.length,duplicates:index.duplicates,limited:index.limited}),
    search:state=>({...similarCases(state,index.cases),indexing:building,indexed:index.cases.length,lastBuilt,indexError:error,coverage:{scanned:index.scanned,skipped:index.errors.length,limited:index.limited,formats:['sig']}}),
    configure(value) {
      if(typeof value!=='string'||value.length>2000||(value&&(!path.isAbsolute(value)||!fs.statSync(value).isDirectory())))throw Error('Vælg en eksisterende, absolut historikmappe.');
      folder=value;generation++;index={cases:[],errors:[],scanned:0,duplicates:0,limited:false};lastBuilt=null;error='';
      fs.writeFileSync(setting,JSON.stringify({folder}));clearTimeout(timer);timer=setTimeout(build,0);timer.unref();changed();return this.info();
    },
    rebuild:()=>{void build();return this.info();},
    close:()=>{clearTimeout(timer);clearInterval(interval);}
  };
}
