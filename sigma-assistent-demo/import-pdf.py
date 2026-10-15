"""Read-only PDF extraction. Preserves actual PDF page numbers, never invents headings."""
import argparse,json,hashlib
from pathlib import Path
from pypdf import PdfReader
p=argparse.ArgumentParser();p.add_argument('pdf');p.add_argument('--output',required=True);p.add_argument('--pages',default='');a=p.parse_args()
source=Path(a.pdf).resolve();output=Path(a.output).resolve()
if output==source:raise SystemExit('Output må ikke overskrive originalen.')
reader=PdfReader(source);selected={int(x) for x in a.pages.split(',') if x.strip()} if a.pages else None
digest=hashlib.sha256(source.read_bytes()).hexdigest();docs=[]
for n,page in enumerate(reader.pages,1):
 if selected and n not in selected:continue
 text=(page.extract_text() or '').strip()
 if not text:continue
 docs.append({'id':f'{source.stem[:50]}-{digest[:8]}-p{n}','name':source.name,'page':n,'text':text[:18000],'sha256':digest})
if len(docs)>100:raise SystemExit('Mere end 100 sider. Vælg relevante sider med --pages 4,5,6. Ingen fuld kontrol må antages.')
if not docs:raise SystemExit('Ingen tekst fundet. Dokumentet kræver OCR; ingen kilder oprettet.')
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(docs,ensure_ascii=False,indent=2),encoding='utf-8');print(f'{len(docs)} sider udtrukket til {output}. Læs og kontrollér uddrag mod originalen.')
