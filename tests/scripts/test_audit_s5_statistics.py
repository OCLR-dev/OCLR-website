"""Source preservation and independently recorded S5 discrepancy acceptance."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("s5_audit", ROOT / "scripts/audit-s5-statistics.py")
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)


class S5StatisticsAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = audit_module.audit()
        cls.raw = json.loads((ROOT / "docs/imports/s5-match-source-snapshot.json").read_text())

    def test_every_raw_game_and_score_is_preserved_exactly_once(self):
        actual = [g for f in self.report["fixtures"] for g in f["games"]]
        expected = [g for f in self.raw["matches"] for g in f["games"]]
        self.assertEqual(len(actual), 332)
        self.assertEqual({g["gameId"] for g in actual}, {g["id"] for g in expected})
        for game in actual:
            _, _, mi, _, gi = game["sourcePointer"].split("/")
            original = self.raw["matches"][int(mi)]["games"][int(gi)]
            self.assertEqual(game["gameId"], original["id"])
            self.assertEqual([{k: s[k] for k in original["scores"][i]} for i, s in enumerate(game["scores"])], original["scores"])
            for key in ["accuracy", "combo", "hitCounts"]:
                self.assertIsNone(game[key])

    def test_all_fixture_counts_and_accepted_team_totals_reconcile(self):
        self.assertEqual(self.report["summary"]["candidateCountsReconciledFixtures"], 34)
        self.assertEqual(self.report["summary"]["standingTotalsReconciledTeams"], 12)
        self.assertEqual(self.report["summary"]["gameDispositions"], {
            "included-candidate": 251, "aborted-no-result": 18, "outside-stage-pool": 63})
        self.assertEqual(self.report["summary"]["rawScoreReconciledFixtures"], 32)
        differences = {f["fixtureId"]: (f["acceptedScore"], f["rawCandidateScore"]) for f in self.report["fixtures"] if not f["scoreReconciles"]}
        self.assertEqual(differences, {"b28": ([6, 2], [5, 3]), "gf": ([7, 4], [8, 3])})

    def test_uid_conflicts_and_name_proposals_do_not_replace_the_roster(self):
        conflict = next(c for c in self.report["identityConflicts"] if c["username"] == "Reecho")
        self.assertEqual(conflict["rosterUid"], 1262507)
        self.assertEqual(conflict["observedUids"], [12624507])
        proposals = {p["unresolvedId"]: p["candidateUids"] for p in self.report["identityProposals"]}
        self.assertEqual(proposals["c-slot-1"], [6938658])
        self.assertEqual(proposals["j-slot-1"], [2361632])
        self.assertEqual(proposals["k-slot-1"], [4087427])
        self.assertEqual(self.report["summary"]["unresolvedRosterPositions"], 15)
        self.assertTrue(all(p["status"].endswith("not-applied") for p in self.report["identityProposals"]))

    def test_nonzero_and_rostered_bench_records_are_not_silently_removed(self):
        expected = {(367569605, 9755808): 13, (369552118, 13617153): 16059, (373526359, 1371514): 3}
        records = {(g["gameId"], s["osuId"]): s["score"] for f in self.report["fixtures"] for g in f["games"] for s in g["scores"]}
        for key, score in expected.items():
            self.assertEqual(records[key], score)
        witnesses = [w for m in self.report["mapStatistics"] for w in m["singleRemovalMeanWitnesses"]]
        self.assertEqual({(w["gameId"], w["osuId"]) for w in witnesses}, set(expected))
        self.assertFalse(self.report["publication"]["performed"])
        self.assertFalse(self.report["publication"]["technicalAdjudicationApproved"])

    def test_all_map_cells_are_compared_without_converting_missing_to_zero(self):
        self.assertEqual(len(self.report["mapStatistics"]), 70)
        self.assertEqual(self.report["summary"]["mapComparisons"], {
            "times": {"match": 65, "different": 2, "unknown-source": 3},
            "average": {"match": 60, "different": 4, "unknown-source": 6},
            "topScore": {"match": 63, "different": 1, "unknown-source": 6}})
        self.assertIsNone(audit_module.numeric("N/A"))
        self.assertIsNone(audit_module.numeric(None))
        self.assertEqual(audit_module.numeric("0"), 0)

    def test_uid_aggregates_keep_zeroes_and_cover_every_candidate_record(self):
        records = [s for f in self.report["fixtures"] for g in f["games"] if g["disposition"] == "included-candidate" for s in g["scores"]]
        rows = self.report["rawUidAggregates"]
        self.assertEqual(sum(p["candidateRecords"] for p in rows), len(records))
        self.assertEqual(sum(p["rawScoreTotalIncludingZero"] for p in rows), sum(s["score"] for s in records))
        self.assertEqual(sum(p["zeroRecords"] for p in rows), sum(s["score"] == 0 for s in records))
        self.assertTrue(all(p["rawScoreMeanIncludingZero"]["denominator"] == p["candidateRecords"] for p in rows))


if __name__ == "__main__":
    unittest.main()
