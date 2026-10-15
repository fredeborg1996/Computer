import importlib.util, pathlib, tempfile, unittest, io
from pypdf import PdfWriter
spec=importlib.util.spec_from_file_location('discovery',pathlib.Path(__file__).with_name('discover-documents.py'))
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)

class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.base=pathlib.Path(self.temp.name)
    def tearDown(self): self.temp.cleanup()
    def project(self,folder,name='Skole regnvand.sig'):
        folder.mkdir(parents=True,exist_ok=True);p=folder/name;p.write_text('fixture');return p
    def test_case_boundary_and_logical_sections(self):
        folder=self.base/'Skole';project=self.project(folder/'Kalkulation')
        (folder/'SAB.txt').write_text('Jordarbejde skal dokumenteres før opstart.',encoding='utf8')
        other=folder/'Anden sag';self.project(other,'Anden.sig');(other/'TAG.txt').write_text('Forkert sag')
        result=d.discover(str(project));self.assertEqual(len(result['documents']),1)
        self.assertIn('ingen fast sideinddeling',result['documents'][0]['pageLabel'])
        self.assertTrue(result['warnings']);self.assertEqual(result['documents'][0]['origin'],'auto-case')
    def test_versions_require_choice(self):
        project=self.project(self.base/'Skole')
        for version in (1,2): (project.parent/f'TAG v{version}.txt').write_text('Afregning af jordarbejder.')
        first=d.discover(str(project));self.assertEqual(first['documents'],[])
        chosen=first['files'][0]['id'];second=d.discover(str(project),selected=[chosen])
        self.assertEqual(len(second['documents']),1)
        self.assertEqual(sum(f['status']=='excluded_version' for f in second['files']),1)
    def test_shared_folder_does_not_guess(self):
        project=self.project(self.base/'Tilbud');self.project(project.parent,'Vej asfalt.sig')
        (project.parent/'SAB.txt').write_text('Generisk materiale uden sagsreference.')
        result=d.discover(str(project));self.assertTrue(result['sharedFolder']);self.assertEqual(result['documents'],[])
    def test_blank_pdf_requires_ocr_and_unsaved_waits(self):
        project=self.project(self.base/'Skole');writer=PdfWriter();writer.add_blank_page(width=100,height=100)
        with (project.parent/'SAB.pdf').open('wb') as stream: writer.write(stream)
        result=d.discover(str(project));self.assertEqual(result['files'][0]['status'],'needs_ocr')
        self.assertEqual(d.discover()['status'],'waiting')

if __name__=='__main__': unittest.main()
