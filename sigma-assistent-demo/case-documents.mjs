import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {threadKey} from './conversation.mjs';
const execute=promisify(execFile);

export function createCaseDocuments(root,data,changed,accept) {
  const settingsFile=path.join(data,'document-folders.json');
  let settings={};try{settings=JSON.parse(fs.readFileSync(settingsFile));}catch{}
  let snapshot,active='',scope='',generation=0,busy=false,pending,controller,lastAttempt=0;
  let result={status:'waiting',folder:'',files:[],documents:[],warnings:[]};
  const save=()=>fs.writeFileSync(settingsFile,JSON.stringify(settings));
  function info(){const {documents,...rest}=result;return {...rest,busy,loadedPages:documents?.length||0};}
  async function pump() {
    if(busy||!pending)return;
    const job=pending;pending=null;busy=true;lastAttempt=Date.now();controller=new AbortController();
    const old=result;result={...result,status:'scanning'};changed(job.state,info());
    try{
      const bundled=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
      const python=process.env.SIGMA_PYTHON||(fs.existsSync(bundled)?bundled:'python.exe');
      const config=settings[job.key]||{};
      const args=[path.join(root,'discover-documents.py'),'--project',job.state.projectFile||'','--folder',config.folder||'','--selected',JSON.stringify(config.selected||[]),'--previous',old.fingerprint||''];
      const {stdout}=await execute(python,args,{windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,signal:controller.signal});
      if(job.generation!==generation)return;
      const found=JSON.parse(stdout);
      result=found.unchanged?{...old,status:'done'}:found;
      if(!found.unchanged)accept(job.state,result);
    }catch(e){if(job.generation===generation)result={...old,status:'error',error:(e.stderr||e.message).slice(0,700)};}
    finally{busy=false;if(job.generation===generation)changed(job.state,info());if(pending)void pump();}
  }
  function refresh(state,force=false) {
    snapshot={mode:state.mode,name:state.name,projectId:state.projectId,projectFile:state.projectFile,revision:state.revision};
    const key=threadKey(snapshot),nextScope=JSON.stringify([key,snapshot.projectFile,settings[key]]);
    if(nextScope!==scope){generation++;controller?.abort();active=key;scope=nextScope;lastAttempt=0;result={status:'waiting',folder:'',files:[],documents:[],warnings:[]};}
    if(snapshot.mode!=='sigma'){result={status:'waiting',folder:'',files:[],documents:[],warnings:['Automatiske sagskilder knyttes først til en rigtig Sigma-kalkulation.']};return;}
    if(!force && Date.now()-lastAttempt<60000)return;
    pending={state:{...snapshot},key,generation};void pump();
  }
  const interval=setInterval(()=>{if(snapshot)refresh(snapshot);},60000);interval.unref();
  return {info,refresh,
    move(before,after){const from=threadKey(before),to=threadKey(after);if(from!==to && settings[from]&&!settings[to]){settings[to]=settings[from];delete settings[from];save();}},
    configure(state,folder){
      if(state.mode!=='sigma')throw Error('Åbn en Sigma-kalkulation først.');
      if(typeof folder!=='string'||folder.length>2000||(folder&&(!path.isAbsolute(folder)||!fs.statSync(folder).isDirectory())))throw Error('Vælg en eksisterende, absolut sagsmappe.');
      const key=threadKey(state);settings[key]={folder,selected:[]};save();refresh(state,true);return info();
    },
    select(state,ids){
      if(threadKey(state)!==active||!Array.isArray(ids)||ids.length>40||ids.some(id=>!result.files?.some(f=>f.id===id&&!['unsupported','too_large'].includes(f.status))))throw Error('Vælg kun læsbare filer fra den aktuelle sag.');
      settings[active]={...(settings[active]||{}),selected:[...new Set(ids)]};save();refresh(state,true);return info();
    },
    close(){clearInterval(interval);controller?.abort();}
  };
}
