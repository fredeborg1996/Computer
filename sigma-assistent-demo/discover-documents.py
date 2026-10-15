"""Bounded, read-only discovery beside a Sigma estimate. No global disk search."""
import argparse, collections, hashlib, io, json, os, pathlib, re, sys, zipfile
import xml.etree.ElementTree as ET

COLLECTION = re.compile(r'^(sagsstyring|tidligere regnet tilbudssager|tilbud til .+|tilbud|sager|projekter|downloads|documents|dokumenter|onedrive.*)$', re.I)
CALC_FOLDER = re.compile(r'^(\d+[. _-]*)?(kalkulation(er)?|beregning(er)?|sigma|tilbudsberegning)$', re.I)
SUPPORTED = {'.pdf', '.docx', '.txt'}
INVENTORY = SUPPORTED | {'.xlsx','.xls','.dwg','.dxf','.zip','.eml','.msg'}
MAX_BYTES = 30 * 1024 * 1024

def category(name):
    for kind, pattern in [('Rettelsesblad',r'rettelse|rettelsesblad|spørgsmål.*svar'),('SAB',r'(?<![a-zæøå])sab(?![a-zæøå])|særlig.*arbejdsbeskriv'),('TAG',r'(?<![a-zæøå])tag(?![a-zæøå])|tilbuds.*afregningsgrundlag'),('AAB',r'(?<![a-zæøå])aab(?![a-zæøå])|almindelig.*arbejdsbeskriv'),('Udbud',r'udbudsbeting|udbudsmaterial|arbejdsbeskriv|geotek|tegningsliste|tilbudsliste')]:
        if re.search(pattern,name,re.I): return kind
    return 'Øvrigt'

def words(text):
    return {w for w in re.findall(r'[a-zæøå]{3,}',text.lower()) if w not in {'tilbud','kalkulation','sigma','default','report','inkl','version','rev'}}

def inside(file, folder):
    return file == folder or folder in file.parents

def scope_for(project, override):
    file = pathlib.Path(project).resolve(strict=True) if project else None
    if override:
        folder=pathlib.Path(override).resolve(strict=True)
        if not folder.is_dir(): raise ValueError('Sagsmappen findes ikke.')
    elif file:
        folder=file.parent
        for _ in range(2):
            if CALC_FOLDER.fullmatch(folder.name) and not COLLECTION.fullmatch(folder.parent.name): folder=folder.parent
            else: break
    else: return None, None, False
    siblings=list(folder.glob('*.sig'))
    tokens=words(file.stem) if file else set()
    shared=bool(COLLECTION.fullmatch(folder.name) or (len(siblings)>1 and any(len(words(p.stem)&tokens)<2 for p in siblings if p!=file)))
    return file,folder,shared

def read_pages(file,raw,remaining):
    if file.suffix.lower()=='.pdf':
        from pypdf import PdfReader
        reader=PdfReader(io.BytesIO(raw))
        if reader.is_encrypted: raise ValueError('Krypteret PDF kræver adgangskode.')
        pages=[];empty=0
        for n,page in enumerate(reader.pages[:remaining],1):
            text=(page.extract_text() or '').strip()
            if text: pages.append((n,text[:18000],'PDF-side '+str(n)))
            else: empty+=1
        return pages,len(reader.pages)>remaining,empty
    if file.suffix.lower()=='.txt':
        try: text=raw.decode('utf-8-sig')
        except UnicodeDecodeError: text=raw.decode('cp1252')
    else:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            info=archive.getinfo('word/document.xml')
            if info.file_size>20*1024*1024: raise ValueError('DOCX-tekst er for stor.')
            xml=archive.read(info)
        if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper(): raise ValueError('DTD/entiteter afvises.')
        root=ET.fromstring(xml);ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text='\n'.join(''.join(p.itertext()) for p in root.findall('.//w:p',ns))
    chunks=[text[i:i+12000] for i in range(0,len(text),12000)]
    return [(i+1,t,'Tekstafsnit '+str(i+1)+' (ingen fast sideinddeling)') for i,t in enumerate(chunks[:remaining]) if t.strip()],len(chunks)>remaining,0

def discover(project='',override='',selected=None,previous=''):
    file,base,shared=scope_for(project,override)
    if base is None: return dict(status='waiting',folder='',documents=[],files=[],warnings=['Kalkulationen er ikke gemt endnu. Gem den i sagsmappen eller vælg sagsmappen én gang.'])
    selected=set(selected or []);found=[];excluded=[];limited=False
    for directory,subdirs,names in os.walk(base,followlinks=False):
        current=pathlib.Path(directory)
        depth=len(current.relative_to(base).parts)
        kept=[]
        for name in sorted(subdirs):
            child=current/name
            if depth>=3 or name.startswith('.') or child.is_symlink() or name.lower() in {'node_modules','$recycle.bin'}: continue
            if any(child.glob('*.sig')) and not (file and inside(file,child)):
                excluded.append(str(child.relative_to(base)));continue
            kept.append(name)
        subdirs[:]=kept
        for name in sorted(names):
            p=current/name
            if p.suffix.lower() not in INVENTORY or p.is_symlink(): continue
            resolved=p.resolve(strict=True)
            if not inside(resolved,base): continue
            stat=p.stat();found.append((p,stat.st_size,stat.st_mtime_ns))
            if len(found)>=300: limited=True;break
        if limited: break
    fingerprint=hashlib.sha256(json.dumps([(str(p),size,mtime) for p,size,mtime in found]+[sorted(selected)]).encode()).hexdigest()
    if fingerprint==previous: return dict(unchanged=True,fingerprint=fingerprint)
    files=[];warnings=[]
    project_words=words(file.stem) if file else set()
    for p,size,_ in found:
        relative=str(p.relative_to(base));kind=category(relative)
        identifier=hashlib.sha256(relative.encode()).hexdigest()[:16]
        associated=not shared or len(words(p.stem)&project_words)>=2
        group=re.sub(r'(?:rev(?:ision)?|version|ver|v)[ _.-]*\d+|20\d{6}|20\d{2}[-_.]\d{2}[-_.]\d{2}','',p.stem.lower())
        group=re.sub(r'[^a-zæøå0-9]','',group)
        old=bool(re.search(r'udgået|erstattet|gammel',relative,re.I))
        state='ready' if associated and not old and kind!='Øvrigt' and p.suffix.lower() in SUPPORTED else 'review'
        if p.suffix.lower() not in SUPPORTED: state='unsupported'
        if size>MAX_BYTES: state='too_large'
        files.append(dict(id=identifier,name=p.name,relative=relative,kind=kind,status=state,group=kind+':'+group,bytes=size,path=str(p),associated=associated))
    groups=collections.defaultdict(list)
    for f in files:
        if f['status'] not in ('unsupported','too_large') and f['kind']!='Øvrigt': groups[f['group']].append(f)
    for candidates in groups.values():
        if len(candidates)>1:
            choices=[f for f in candidates if f['id'] in selected]
            if len(choices)!=1:
                for f in candidates: f['status']='ambiguous'
            else:
                for f in candidates: f['status']='ready' if f in choices else 'excluded_version'
    docs=[];remaining=100
    for f in sorted(files,key=lambda f:({'Rettelsesblad':0,'SAB':1,'TAG':2,'AAB':3}.get(f['kind'],4),f['relative'])):
        if f['id'] in selected and f['status']=='review': f['status']='ready'
        if f['status']!='ready': continue
        if remaining<=0: f['status']='page_limit';limited=True;continue
        p=pathlib.Path(f['path'])
        try:
            with p.open('rb') as stream: raw=stream.read(MAX_BYTES+1)
            if len(raw)>MAX_BYTES: raise ValueError('Filen overstiger læsegrænsen')
            digest=hashlib.sha256(raw).hexdigest()
            pages,partial,empty=read_pages(p,raw,remaining)
            f.update(sha256=digest,partial=partial,emptyPages=empty,pages=len(pages))
            if not pages: f['status']='needs_ocr';continue
            for number,text,label in pages:
                docs.append(dict(id='auto-'+f['id']+'-'+digest[:12]+'-'+str(number),name=f['name'],page=number,pageLabel=label,text=text,sha256=digest,origin='auto-case',relative=f['relative'],kind=f['kind']))
            remaining-=len(pages);f['status']='loaded'
            if partial or empty: warnings.append(f['name']+': kun delvis tekst er læst; tomme PDF-sider kan kræve OCR.')
        except Exception as error: f.update(status='error',error=str(error)[:400])
    for f in files: f.pop('path',None);f.pop('group',None)
    if shared: warnings.append('Fælles mappe: filer uden entydig sagsreference er ikke automatisk knyttet til kalkulationen.')
    if excluded: warnings.append('Undermapper med andre Sigma-kalkulationer er udeladt: '+', '.join(excluded[:5]))
    return dict(status='done',folder=str(base),fingerprint=fingerprint,files=files,documents=docs,warnings=warnings,limited=limited,sharedFolder=shared)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--project',default='');parser.add_argument('--folder',default='');parser.add_argument('--selected',default='[]');parser.add_argument('--previous',default='');args=parser.parse_args()
    try: print(json.dumps(discover(args.project,args.folder,json.loads(args.selected),args.previous),ensure_ascii=True))
    except Exception as error: print(str(error),file=sys.stderr);sys.exit(1)
