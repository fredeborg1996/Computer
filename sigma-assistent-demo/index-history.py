"""Local read-only index of saved Sigma estimates. No model or network calls."""
import sys, pathlib, json, hashlib, importlib.util, os, math
spec = importlib.util.spec_from_file_location('sigma_reader', pathlib.Path(__file__).with_name('read-sigma.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

def build(folder):
    base = pathlib.Path(folder).resolve(strict=True)
    if not base.is_dir(): raise ValueError('Historikmappen findes ikke.')
    cases, errors, seen, scanned, duplicates = [], [], {}, 0, 0
    payload_size = 0
    for directory, subdirs, filenames in os.walk(base, followlinks=False):
        subdirs[:] = [d for d in subdirs if not d.startswith('.') and not pathlib.Path(directory,d).is_symlink()]
        for name in sorted(filenames):
            file = pathlib.Path(directory,name)
            # .sit templates are not evidence of a previously calculated tender.
            if file.suffix.lower() != '.sig' or file.is_symlink(): continue
            if scanned >= 500:
                return dict(cases=cases, errors=errors, scanned=scanned, duplicates=duplicates, limited=True)
            scanned += 1
            try:
                source, xml, source_hash = reader.read_xml(file)
                roots = xml.findall('ProjectData/ComponentData/Component')
                if not roots: raise ValueError('Ingen Sigma-poststruktur.')
                rows = []
                identity = []
                def visit(element, depth=0, parent=None):
                    if depth > 50 or len(rows) >= 10000: raise ValueError('Historikgrænse for poststruktur nået.')
                    if element.findtext('Disabled','false').lower() == 'true': return
                    if element.findtext('Level') != '0':
                        try:
                            qty=float(element.findtext('Amount',''))
                            if not math.isfinite(qty) or qty<0: qty=None
                        except ValueError: qty=None
                        row_id=str(len(rows)+1)
                        rows.append(dict(id=row_id,parentId=parent,text=element.findtext('Name','')[:300],unit=element.findtext('Unit',''),qty=qty))
                        parent=row_id
                        identity.append([element.findtext(key,'') for key in ('Name','Unit','Amount','UnitSalesPrice','SalesPrice','CostPrice')])
                    for child in element.findall('Component'): visit(child,depth+1,parent)
                for element in roots: visit(element)
                if not rows: raise ValueError('Ingen aktive historiske poster.')
                # Text indexing has no need to assume that stored totals are current or correct.
                # Prices/quantities are deliberately not promoted into reusable price evidence.
                # Identical contents and semantic copies must not fill every result slot.
                signature = hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()
                if signature in seen:
                    duplicates += 1
                    seen[signature]['aliases'].append(dict(file=str(file),hash=source_hash))
                    continue
                record = dict(name=source.stem,file=str(file),relative=str(file.relative_to(base)),hash=source_hash,rows=rows,aliases=[])
                payload_size += len(json.dumps(record,ensure_ascii=True))
                if payload_size > 8 * 1024 * 1024:
                    return dict(cases=cases,errors=errors,scanned=scanned,duplicates=duplicates,limited=True)
                cases.append(record)
                seen[signature] = record
            except Exception as error:
                errors.append(dict(file=str(file.relative_to(base)),error=str(error)[:400]))
    return dict(cases=cases, errors=errors, scanned=scanned, duplicates=duplicates, limited=False)

if __name__ == '__main__':
    try: print(json.dumps(build(sys.argv[1]), ensure_ascii=True))
    except Exception as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
