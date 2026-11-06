import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('recover', 'scripts/prepare-s6-map-file.py')
recover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recover)


class S6FileTests(unittest.TestCase):
    def test_exact_file_metadata_background_and_regenerated_imports(self):
        data, image = recover.build()
        self.assertEqual(json.loads(recover.OUTPUT.read_text()), data)
        self.assertEqual(recover.COVER.read_bytes(), image)
        row = data['s6'][0]
        self.assertEqual([row['attributes'][k] for k in ['cs', 'ar', 'od']], [4, 9.5, 9.1])
        self.assertEqual(row['beatmapSetId'], 1034526)
        spec = importlib.util.spec_from_file_location('builder', 'scripts/prepare-s6-archive.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        generated = builder.build()['pools']
        for name in ['s6-archive', 's6-confirmed-archive']:
            pools = json.loads(Path('docs/imports/' + name + '.json').read_text())['pools']
            self.assertEqual(generated, pools)
            saved = next(m for p in pools if p['id'] == 'captain-qualifier' for m in p['maps'] if m['slot'] == 'NM3')
            self.assertEqual(saved['coverPath'], row['coverPath'])
            self.assertEqual(saved['beatmapId'], 2314568)
            self.assertEqual([saved[k] for k in ['stars', 'bpm', 'drainSeconds']], [6.35, 209, 216])

    def test_modified_package_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'changed.osz'
            path.write_bytes(recover.PACKAGE.read_bytes() + b'changed')
            with self.assertRaises(ValueError):
                recover.build(path)
