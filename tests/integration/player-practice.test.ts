import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Slot } from "../../scripts/beatmap-similarity-data";
import {
  collectPlayerEvidence,
  practiceSnapshotSchema,
  type PracticeSnapshot,
} from "../../scripts/player-practice-data";
import { playerPractice } from "../../scripts/player-practice";
import { assertTestDatabase } from "../database";

const checksum = "a".repeat(32);
const times = { s9: "2023-12-01T00:00:00Z", s10: "2025-04-01T00:00:00Z" };
const profileId = 15;
const bpms = [
  140, 145, 150, 155, 160, 165, 170, 180, 185, 190, 195, 200, 205, 210,
];

function season(edition: "s9" | "s10", offset: number) {
  const at = times[edition];
  const slots: Slot[] = bpms.map((bpm, index) => ({
    edition,
    poolId: "final",
    poolName: "Final",
    slot: "NM" + (index + 1),
    category: "NM",
    bid: offset + index + 1,
    setId: offset + index + 1,
    title: "Synthetic " + (offset + index + 1),
    mod: "NM",
    checksum,
    difficultyFetchedAt: at,
    values: {
      stars:
        index < 12 ? 6 : edition === "s10" ? 7.5 : index === 12 ? 5.65 : 6.08,
      bpm: bpm + (edition === "s10" ? 5 : 0),
      duration: 120,
      ar: 9,
      od: 9,
      cs: 4,
      hp: 5,
    },
  }));
  const fixtures = ["match-a", "match-b"];
  const plays = [...slots.slice(0, 4), ...slots.slice(8, 12)].flatMap(
    (slot, index) =>
      [profileId, 21, 22, 23, 24].map((osuId) => ({
        osuId,
        beatmapId: slot.bid!,
        slot: slot.slot,
        at,
        gameId: slot.bid!,
        mpId: offset + 1,
        fixtureId: fixtures[index % 2],
        mods: ["NF"],
        scoringType: "scorev2",
        score: 100_000,
        rawScore: osuId === profileId && index >= 4 ? 65_000 : 100_000,
      })),
  );
  return {
    slots,
    release: {
      slug: edition,
      archiveKey: "fixture",
      publishedAt: at,
      players: [{ osuId: profileId, username: "Synthetic" }],
      fixtures: fixtures.map((id) => ({
        id,
        covered: true,
        technicalAdjudication: false,
      })),
      poolFixtures: fixtures.map((id) => ({
        id,
        maps: slots.map((slot) => ({ slot: slot.slot, mapId: slot.bid })),
      })),
      plays,
    },
  };
}

function fixture() {
  const s9 = season("s9", 100);
  const s10 = season("s10", 200);
  return practiceSnapshotSchema.parse({
    version: 1,
    capturedAt: times.s10,
    pools: {
      version: 1,
      capturedAt: times.s10,
      slots: [...s9.slots, ...s10.slots],
      sources: [s9, s10].map(({ release }) => ({
        edition: release.slug,
        kind: "archive",
        revision: 1,
      })),
    },
    releases: [s9.release, s10.release],
  });
}

it("keeps MOD, scoring rules, game identity and raw scores in the comparison boundary", () => {
  const snapshot = fixture();
  const s9 = snapshot.releases[0];
  const base = s9.plays[0];
  s9.plays.push(
    { ...base, osuId: 25, rawScore: 900_000, mods: [] },
    { ...base, osuId: 26, rawScore: 900_000, scoringType: "score" },
    { ...base, osuId: 27, rawScore: 900_000, gameId: 999 },
    { ...base, osuId: 21, rawScore: 900_000 },
  );
  const report = collectPlayerEvidence(snapshot, profileId);
  const first = report.evidence.find(
    (row) => row.edition === "s9" && row.beatmapId === 101,
  );
  expect(first).toMatchObject({ peers: 3, peerMedian: 100_000, ratio: 1 });
  expect(report.evidence.find((row) => row.rawScore === 65_000)?.ratio).toBe(
    0.65,
  );
});

it("excludes withdrawn or unmatched fixture evidence and treats missing MOD as unknown", () => {
  const snapshot = fixture();
  snapshot.releases[0].fixtures[0].covered = false;
  snapshot.releases[1].poolFixtures[0].maps = [];
  const target = snapshot.releases[1].plays.find(
    (row) => row.osuId === profileId && row.fixtureId === "match-b",
  )!;
  target.mods = null;
  const report = collectPlayerEvidence(snapshot, profileId);
  expect(report.publishedPlays).toBe(16);
  expect(report.exclusions).toEqual({
    "unverified-fixture": 4,
    "unverified-pool-map": 4,
    "unverified-mod": 1,
  });
  expect(report.evidence).toHaveLength(7);
  expect(
    practiceSnapshotSchema.safeParse({
      ...snapshot,
      releases: [
        snapshot.releases[0],
        { ...snapshot.releases[1], publishedAt: null },
      ],
    }).success,
  ).toBe(false);
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "practice ranking with pgvector",
  () => {
    let db: Client;
    beforeAll(async () => {
      const url = process.env.TEST_DATABASE_URL;
      assertTestDatabase(url);
      db = new Client({ connectionString: url });
      await db.connect();
    });
    afterAll(async () => db?.end());

    it("uses evidence-supported chart demands, difficulty steps and a frozen S9 holdout split", async () => {
      const snapshot = fixture();
      const report = await playerPractice(db, snapshot, profileId, true);
      expect(report.status).toBe("ready");
      expect(report.usable).toMatchObject({
        games: 16,
        beatmaps: 16,
        fixtures: 4,
      });
      expect(report.assessments).toHaveLength(1);
      expect(report.assessments[0]).toMatchObject({
        mod: "NM",
        feature: "bpm",
        classification: "practice-opportunity",
      });
      const recommendation = report.recommendations[0];
      expect(recommendation.anchor.fixtureUrl).toMatch(
        /^https:\/\/oclr.org\/tournaments\/s(9|10)\/matches\//,
      );
      expect(
        recommendation.steps.map(({ step, candidate }) => [
          step,
          candidate?.bid,
        ]),
      ).toEqual([
        ["foundation", 113],
        ["near-reference", 208],
      ]);
      expect(recommendation.steps[0].candidate).toMatchObject({
        targetFeature: 205,
        beatmapUrl: "https://osu.ppy.sh/beatmaps/113",
        sources: [
          {
            edition: "s9",
            url: "https://oclr.org/tournaments/s9/mappools/final",
          },
        ],
      });
      const prior = snapshot.releases[1].plays[0];
      snapshot.releases[1].plays.push({
        ...prior,
        fixtureId: "unmatched-fixture",
        beatmapId: 208,
        slot: "NM8",
      });
      const afterPriorPlay = await playerPractice(
        db,
        snapshot,
        profileId,
        false,
      );
      expect(afterPriorPlay.recommendations[0].steps[1].candidate?.bid).toBe(
        114,
      );
      expect(report.temporalValidation?.comparisons[0]).toMatchObject({
        before: { cutoff: 185, referenceMaps: 14 },
        after: { cutoff: 185, referenceMaps: 14 },
        outcome: "observed-again",
      });
    });

    it("requires evidence for both levels of the same MOD before returning a conclusion", async () => {
      const snapshot: PracticeSnapshot = fixture();
      for (const release of snapshot.releases)
        release.plays = release.plays.filter(
          (row) => row.osuId !== profileId || row.beatmapId === 101,
        );
      const report = await playerPractice(db, snapshot, profileId, true);
      expect(report.status).toBe("insufficient-samples");
      expect(report.usable.games).toBe(1);
      expect(report.recommendations).toEqual([]);
      expect(report.temporalValidation?.comparisons).toEqual([]);
    });
  },
);
