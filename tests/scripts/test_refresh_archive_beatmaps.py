import importlib.util
import json
import unittest

spec = importlib.util.spec_from_file_location('capture', 'scripts/refresh-archive-beatmaps.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def test_confirmed_originals_survive_future_snapshot_refreshes(self):
        ids = capture.expected_ids()
        self.assertIn(2678913, ids)
        self.assertIn(2933979, ids)
        for bid in [2755377, 4000824, 4934310, 1571394, 5206595]:
            self.assertIn(bid, ids)
        self.assertIn(2720295, ids)
        self.assertIn(2567502, ids)
        self.assertIn(1532662, ids)  # S1
        self.assertIn(1009329, ids)  # S2, keep even if unavailable
        self.assertIn(2140353, ids)  # S3
        self.assertEqual(ids, sorted(set(ids)))
    def payload(self, **changes):
        beatmap = dict(id=42, beatmapset_id=7, mode='osu', version='Hard',
                       difficulty_rating=4.2, bpm=180, hit_length=90,
                       total_length=120, cs=4, ar=9, accuracy=8,
                       last_updated='2020-01-01T00:00:00Z',
                       owners=[{'username': 'Guest mapper'}])
        beatmap.update(changes)
        return '<script id="json-beatmapset" type="application/json">'+json.dumps(dict(id=7, artist='Artist', title='Song', creator='Set owner', beatmaps=[beatmap]))+'</script>'

    def test_difficulty_identity_drain_length_and_guest_mapper(self):
        row = capture.extract(self.payload(), 42)
        self.assertEqual(row['drainSeconds'], 90)
        self.assertEqual(row['mapper'], 'Guest mapper')
        self.assertEqual(row['title'], 'Artist - Song [Hard]')
        self.assertEqual(row['artist'], 'Artist')
        self.assertEqual(row['difficulty'], 'Hard')
        self.assertNotIn('owners', row)
        self.assertNotIn('total_length', row)

    def test_wrong_bid_is_not_substituted(self):
        with self.assertRaises(StopIteration):
            capture.extract(self.payload(), 43)

    def test_set_mismatch_is_rejected(self):
        with self.assertRaises(ValueError):
            capture.extract(self.payload(beatmapset_id=8), 42)

    def test_other_ruleset_is_rejected(self):
        with self.assertRaises(ValueError):
            capture.extract(self.payload(mode='mania'), 42)

    def test_missing_payload_is_rejected(self):
        with self.assertRaises(ValueError):
            capture.extract('<html>Unavailable</html>', 42)
