"""Read a saved Sigma project, never write to it or evaluate expressions."""
import sys, json, hashlib, pathlib, zipfile, xml.etree.ElementTree as ET
from decimal import Decimal

LIMIT = 32 * 1024 * 1024

def read_xml(filename):
    source = pathlib.Path(filename).resolve(strict=True)
    if source.suffix.lower() not in ('.sig', '.sit') or source.stat().st_size > LIMIT:
        raise ValueError('Vælg en Sigma .sig/.sit på højst 32 MB.')
    raw = source.read_bytes()
    original_hash = hashlib.sha256(raw).hexdigest()
    if raw[:2] == b'PK':
        with zipfile.ZipFile(source) as z:
            entries = [i for i in z.infolist() if not i.is_dir() and pathlib.PurePosixPath(i.filename.strip()).suffix.lower() in ('.sig', '.sit')]
            if len(entries) != 1 or entries[0].file_size > LIMIT:
                raise ValueError('Arkivet skal have præcis én afgrænset Sigma-projektfil.')
            raw = z.read(entries[0])
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper() or b'\x00' in raw:
        raise ValueError('DTD, entiteter og binær XML understøttes ikke.')
    root = ET.fromstring(raw)
    if root.tag != 'SigmaFile' or root.get('FileType') != 'SIGPROJ' or root.get('FileSaveVersion') != '41':
        raise ValueError('Kun verificeret Sigma SIGPROJ-format 41 understøttes.')
    return source, root, original_hash

def read_project(filename):
    source, root, original_hash = read_xml(filename)
    components = root.findall('ProjectData/ComponentData/Component')
    wrapper = components[0] if len(components) == 1 and components[0].findtext('Level') == '0' else None
    if wrapper is None:
        raise ValueError('Projektets rod kunne ikke identificeres entydigt.')
    rows = []
    def number(element, key):
        value = Decimal(element.findtext(key, ''))
        if not value.is_finite() or value < 0:
            raise ValueError('Ugyldigt eller negativt Sigma-tal: ' + key)
        return float(value)
    def visit(element, parent, row_id, depth=0):
        if depth > 50 or len(rows) >= 1000:
            raise ValueError('Projektet overskrider grænsen på 1000 poster / 50 niveauer.')
        if element.findtext('Disabled', 'false').lower() == 'true':
            raise ValueError('Deaktiverede poster kræver afstemning i Sigma før import.')
        rows.append(dict(id=row_id, parentId=parent, text=element.findtext('Name', ''), unit=element.findtext('Unit', ''),
            quantity=number(element, 'Amount'), unitSalesPrice=number(element, 'UnitSalesPrice'),
            salesPrice=number(element, 'SalesPrice'), costPrice=number(element, 'CostPrice'), position=element.findtext('Position', '')))
        for index, child in enumerate(element.findall('Component')):
            visit(child, row_id, row_id + '.' + str(index + 1), depth + 1)
    for index, child in enumerate(wrapper.findall('Component')):
        visit(child, None, str(index + 1))
    sales_total = number(wrapper, 'SalesPrice')
    summed = sum(Decimal(str(r['salesPrice'])) for r in rows if r['parentId'] is None)
    if abs(summed - Decimal(str(sales_total))) > Decimal('0.02'):
        raise ValueError('Rodens salgspris afviger fra hovedposterne. Tillæg/afrunding skal afstemmes i Sigma.')
    return dict(version=2, projectId='file:' + str(source).casefold(), name=source.stem, items=rows,
        salesTotal=sales_total, sourceKind='saved-file', projectFile=str(source), sourceHash=original_hash)

if __name__ == '__main__':
    try:
        print(json.dumps(read_project(sys.argv[1]), ensure_ascii=True))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
