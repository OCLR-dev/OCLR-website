import copy
import importlib.util
import json
import unittest

spec = importlib.util.spec_from_file_location('backgrounds', 'scripts/prepare-archive-backgrounds.py')
backgrounds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backgrounds)


class BackgroundReviewTests(unittest.TestCase):
    def test_reviewed_selections_are_first_usable_exact_title_and_artist_matches(self):
        backgrounds.validate_evidence()

    def test_changed_selection_cannot_silently_replace_the_reviewed_set(self):
        rows = copy.deepcopy(backgrounds.ROWS)
        rows[0]['backgroundSetId'] = 42
        with self.assertRaises(ValueError):
            backgrounds.validate_evidence(rows)

    def test_an_earlier_usable_candidate_prevents_selecting_a_later_result(self):
        review = json.loads((backgrounds.ROOT / 'docs/imports/archive-background-review.json').read_text())
        entry = next(r for r in review['entries'] if r['beatmapId'] == 446261)
        entry['checkedUnavailableCandidates'] = []
        with self.assertRaisesRegex(ValueError, 'Earlier matching'):
            backgrounds.validate_evidence(review=review)
