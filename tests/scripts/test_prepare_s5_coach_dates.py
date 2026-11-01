"""Historical identity/date safety checks using saved public evidence."""

import copy
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("s5_coach_dates", ROOT / "scripts/prepare-s5-coach-dates.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class S5CoachDatesTest(unittest.TestCase):
    def setUp(self):
        self.source = MODULE.load(MODULE.IMPORTS / "s5-source-records.json")
        self.evidence = MODULE.load(MODULE.IMPORTS / "s5-coach-date-sources.json")

    def review(self):
        return MODULE.reconcile(self.source, self.evidence)

    def test_recycled_username_uses_historical_account_and_seven_scores(self):
        result = self.review()
        self.assertEqual(len(result["coaches"]), 12)
        person = next(p for p in result["coaches"] if p["username"] == "demisemiquaver")
        self.assertEqual(person["osuId"], 8501053)
        self.assertEqual(len({p["beatmapId"] for p in person["qualifierProof"]}), 7)
        self.assertNotIn(40214007, [p["osuId"] for p in result["coaches"]])

    def test_post_season_account_is_rejected_even_with_exact_name(self):
        p = self.evidence["profiles"][-1]
        p.update(p["rejectedLookup"])
        with self.assertRaisesRegex(AssertionError, "postdates"):
            self.review()

    def test_recycled_name_requires_all_seven_score_matches(self):
        for m in self.evidence["matches"]:
            for g in m.get("games", []):
                if g["beatmapId"] == 792500:
                    for p in g["scores"]:
                        if p["osuId"] == 8501053:
                            p["score"] += 1
        with self.assertRaises(AssertionError):
            self.review()

    def test_schedule_uses_wall_time_and_keeps_room_open_time(self):
        matches = {m["id"]: m for m in self.review()["matches"]}
        self.assertEqual(matches["a1"]["scheduledAt"], "2020-11-21T20:00:00+08:00")
        self.assertEqual(matches["a1"]["roomOpenedAtLocal"], "2020-11-21T20:03:01+08:00")
        self.assertEqual(matches["b32"]["scheduledAt"], "2021-01-01T20:30:00+08:00")
        self.assertEqual([m["id"] for m in matches.values() if m["yearCorrected"]], ["b32"])

    def test_unexpected_date_conflict_fails_instead_of_guessing(self):
        self.source["matches"][0]["dateAsStored"] = "2020-11-20"
        with self.assertRaisesRegex(AssertionError, "date conflict"):
            self.review()

    def test_prepare_preserves_original_and_all_competition_fields(self):
        original = MODULE.load(MODULE.IMPORTS / "s5-reviewed-import.json")
        untouched = copy.deepcopy(original)
        prepared = MODULE.prepare_archive(original, self.review())
        self.assertEqual(original, untouched)
        for key in original.keys() - {"players", "unresolvedPlayers", "sourceFacts", "matches", "notes"}:
            self.assertEqual(prepared[key], original[key], key)
        self.assertEqual(prepared["players"][:len(original["players"])], original["players"])
        for before, after in zip(original["matches"], prepared["matches"], strict=True):
            self.assertEqual(
                {k: v for k, v in before.items() if k not in {"scheduledAt", "timeZone"}},
                {k: v for k, v in after.items() if k not in {"scheduledAt", "timeZone"}},
            )
        self.assertEqual(MODULE.prepare_archive(prepared, self.review()), prepared)

    def test_existing_uid_or_schedule_conflict_fails(self):
        original = MODULE.load(MODULE.IMPORTS / "s5-reviewed-import.json")
        original["players"][0]["osuId"] = self.review()["coaches"][0]["osuId"]
        with self.assertRaisesRegex(AssertionError, "UID collision"):
            MODULE.prepare_archive(original, self.review())
        original = MODULE.load(MODULE.IMPORTS / "s5-reviewed-import.json")
        original["matches"][0]["scheduledAt"] = "2020-11-21T10:00:00Z"
        with self.assertRaisesRegex(AssertionError, "schedule differs"):
            MODULE.prepare_archive(original, self.review())


if __name__ == "__main__":
    unittest.main()
