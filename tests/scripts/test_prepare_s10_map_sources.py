import ast
import json
import unittest
from pathlib import Path


class S10SourceTests(unittest.TestCase):
    def test_generator_and_package_retain_confirmed_originals(self):
        path = Path('scripts/prepare-s10-archive.py')
        tree = ast.parse(path.read_text())
        # Evaluate only the generator's imports/source constants, without
        # requiring an XLSX or running the unrelated worksheet extraction.
        nodes = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom)) or
                 isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in
                 ['MAP_SUPPLEMENTS', 'ORIGINAL_BEATMAP_IDS'] for t in node.targets)]
        namespace = {'__file__': str(path.resolve())}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec'), namespace)
        package = json.loads(Path('docs/imports/s10-archive.json').read_text())
        supplements = json.loads(Path('src/data/archive-map-supplements.json').read_text())['s10']
        for entry in supplements:
            self.assertEqual(namespace['ORIGINAL_BEATMAP_IDS'][entry['beatmapId']], entry['originalId'])
            pool = next(p for p in package['pools'] if p['id'] == entry['poolId'])
            row = next(m for m in pool['maps'] if m['slot'] == entry['slot'])
            self.assertEqual(row['beatmapId'], entry['beatmapId'])
            self.assertEqual(row['originalId'], entry['originalId'])
