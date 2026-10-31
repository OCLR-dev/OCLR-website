import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import {
  historicalArchiveSchema,
  archiveCounts,
  archiveWinner,
  recordedArchiveMatch,
} from "../../src/lib/historical-archive";
import { archiveKeyVisual } from "../../src/lib/archive-key-visual";

const raw = JSON.parse(readFileSync("docs/imports/s6-archive.json", "utf8"));
const archive = historicalArchiveSchema.parse(raw);
const reconstruction = JSON.parse(
  readFileSync("docs/imports/s6-match-reconstruction.json", "utf8"),
);

it("reproduces the import package without network or private workbook reads", () => {
  const generated = execFileSync(
    "python3",
    [
      "-c",
      "import importlib.util,json; s=importlib.util.spec_from_file_location('prepare','scripts/prepare-s6-archive.py'); m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.build(),ensure_ascii=False))",
    ],
    { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
  );
  expect(JSON.parse(generated)).toEqual(raw);
  expect(Buffer.byteLength(JSON.stringify(raw))).toBeLessThan(450000);
  expect(archiveCounts(archive)).toEqual({
    teams: 12,
    players: 85,
    picks: 0,
    results: 0,
    incomplete: 33,
    pools: 5,
    maps: 71,
  });
});

it("retains unknown identities, VICE and replacements without fabricated UID or membership", () => {
  expect(archive.players).toHaveLength(70);
  expect(archive.unresolvedPlayers).toHaveLength(13);
  expect(
    archive.unresolvedPlayers!.filter((p) => p.role === "captain"),
  ).toEqual([
    expect.objectContaining({
      username: "Fushimi Rio",
      teamId: "team-l",
      tier: 0,
    }),
  ]);
  expect(archive.players.filter((p) => p.sourceRole === "VICE")).toHaveLength(
    12,
  );
  expect(
    archive.players
      .filter((p) => p.sourceRole === "VICE")
      .every((p) => p.tier === null),
  ).toBe(true);
  expect(archive.rosterReplacements).toHaveLength(1);
  expect(archive.rosterReplacements![0].people.map((p) => p.osuId)).toEqual([
    8425774, 14947596,
  ]);
  expect(
    archive.players.some((p) => [8425774, 14947596].includes(p.osuId)),
  ).toBe(false);
  expect(archive.rosterReplacements![0].replacedAt).toBeNull();
});

it("keeps both pending interpretations and every source game without approving results", () => {
  const di = archive.matches.find((m) => m.id === "mp-84398168")!;
  const cf = archive.matches.find((m) => m.id === "mp-85503945")!;
  expect(di.review).toMatchObject({
    status: "pending",
    workingScore: [3, 5],
    rawScore: [3, 6],
    possibleScore: null,
  });
  expect(
    di.review!.games.find((g) => g.gameId === 432260817)?.disposition,
  ).toBe("post-match-entertainment-pending-confirmation");
  expect(cf.review).toMatchObject({
    status: "pending",
    workingScore: [2, 5],
    rawScore: [2, 5],
    possibleScore: [2, 6],
  });
  expect(cf.review!.games.find((g) => g.gameId === 437459269)).toMatchObject({
    endTime: null,
    disposition: "aborted-no-result",
  });
  expect(archive.matches.reduce((n, m) => n + m.review!.games.length, 0)).toBe(
    348,
  );
  for (const m of archive.matches) {
    expect(m.score).toBeNull();
    expect(archiveWinner(m)).toBeNull();
    expect(recordedArchiveMatch(m)).toBe(false);
    expect(m.review!.games).toEqual(
      reconstruction.matches.find((r: { id: number }) => `mp-${r.id}` === m.id)
        .gameReview,
    );
  }
  expect(archive.standings).toEqual([]);
  expect(archive.matches).toHaveLength(33); // no invented G–J fixture
  expect(archive.reviewTables).toHaveLength(2);
});

it("retains unknown map metadata, raw qualifiers, scheduled and actual times separately", () => {
  expect(
    archive.pools
      .filter((p) => ["es", "fs"].includes(p.id))
      .flatMap((p) => p.maps)
      .every((m) => m.title === null),
  ).toBe(true);
  expect(
    archive.qualifiers!.flatMap((q) => q.records).flatMap((r) => r.scores),
  ).toHaveLength(133);
  expect(
    archive
      .qualifiers!.find((q) => q.poolId === "captain-qualifier")!
      .records.find((r) => r.username === "Azureus")!.scores,
  ).toEqual([]);
  expect(archive.matches.filter((m) => m.scheduledAt)).toHaveLength(6);
  expect(archive.matches.every((m) => m.review!.startedAt !== null)).toBe(true);
  expect(archiveKeyVisual(archive, null)).toEqual({
    src: "/archive/s6/key-visual.webp",
    width: 1920,
    height: 1080,
  });
  expect(
    archiveKeyVisual(
      { ...archive, sourceUrl: "https://example.com/unknown" },
      null,
    ),
  ).toBeUndefined();
});

it.each([
  (a: typeof archive) => {
    a.matches[0].score = [5, 4];
  },
  (a: typeof archive) => {
    a.matches[0].forfeitWinner = 0;
  },
  (a: typeof archive) => {
    a.matches[0].review!.redTeamId = "team-l";
  },
  (a: typeof archive) => {
    a.matches[0].review!.games.push(a.matches[0].review!.games[0]);
  },
  (a: typeof archive) => {
    a.unresolvedPlayers = [];
  },
  (a: typeof archive) => {
    a.unresolvedPlayers!.push(a.unresolvedPlayers![0]);
  },
  (a: typeof archive) => {
    a.unresolvedPlayers![0].teamId = "missing";
  },
  (a: typeof archive) => {
    a.players.find((p) => p.sourceRole === "VICE")!.tier = 1;
  },
  (a: typeof archive) => {
    a.rosterReplacements![0].people[0].osuId = a.players[0].osuId;
  },
  (a: typeof archive) => {
    a.qualifiers![0].records[0].scores[0].slot = "NM99";
  },
  (a: typeof archive) => {
    a.reviewTables![0].rows[0].teamId = "missing";
  },
])("rejects false approval or conflicting source representation", (mutate) => {
  const a = structuredClone(archive);
  mutate(a);
  expect(historicalArchiveSchema.safeParse(a).success).toBe(false);
});

it("keeps source extensions strict against extra private fields", () => {
  expect(
    historicalArchiveSchema.safeParse({ ...raw, formatVersion: 1 }).success,
  ).toBe(false);
  expect(
    historicalArchiveSchema.safeParse({
      ...raw,
      unresolvedPlayers: [{ ...raw.unresolvedPlayers[0], contact: "private" }],
    }).success,
  ).toBe(false);
  expect(
    historicalArchiveSchema.safeParse({
      ...raw,
      qualifiers: [{ ...raw.qualifiers[0], answers: "private" }],
    }).success,
  ).toBe(false);
});
