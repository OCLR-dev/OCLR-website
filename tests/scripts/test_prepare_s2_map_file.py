import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('recover', 'scripts/prepare-s2-map-file.py')
recover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recover)


class S2FileTests(unittest.TestCase):
    def test_reviewed_exact_difficulty_and_unmodified_background(self):
        data, image = recover.build()
        self.assertEqual(json.loads(recover.OUTPUT.read_text()), data)
        self.assertEqual(recover.COVER.read_bytes(), image)
        row = data['s2'][0]
        self.assertEqual(row['beatmapMd5'], '256a8a9df9a06d924d1578357ad56840')
        self.assertEqual(row['attributes']['drainSeconds'], 232)
        self.assertEqual(row['attributes']['hp'], 5.5)

    def test_modified_package_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'changed.osz'
            path.write_bytes(recover.PACKAGE.read_bytes() + b'changed')
            with self.assertRaises(ValueError):
                recover.build(path)
