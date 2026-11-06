import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('builder', 'scripts/prepare-s5-archive.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class S5SupplementTests(unittest.TestCase):
    def test_shared_supplements_reproduce_both_checked_in_packages(self):
        pools = builder.build()['pools']
        for name in ['s5-archive.json', 's5-reviewed-import.json']:
            package = json.loads((Path('docs/imports') / name).read_text())
            self.assertEqual(pools, package['pools'])
        maps = {m['slot']: m for p in pools if p['id'] == 'pool-2' for m in p['maps']}
        self.assertEqual(maps['DT2']['originalId'], 2933979)
        self.assertEqual(maps['DT4']['originalId'], 2678913)
        self.assertEqual(maps['DT4']['bpm'], 210)
        self.assertEqual(maps['DT4']['stars'], 6.27)
        final = next(p for p in pools if p['id'] == 'pool-4')
        self.assertEqual(next(m for m in final['maps'] if m['slot'] == 'NM4')['originalId'], 2755377)
