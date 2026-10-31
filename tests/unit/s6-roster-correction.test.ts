import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  historicalArchiveSchema,
  publicHistoricalArchive,
} from "../../src/lib/historical-archive";

function legacyImport() {
  const saved = JSON.parse(
    readFileSync("docs/imports/s6-confirmed-archive.json", "utf8"),
  );
  const pair = saved.players.filter((p: { osuId: number }) =>
    [8425774, 14947596].includes(p.osuId),
  );
  saved.players = saved.players.filter(
    (p: { osuId: number }) => ![8425774, 14947596].includes(p.osuId),
  );
  saved.rosterReplacements = [
    {
      id: "team-k-tier-4-history",
      teamId: "team-k",
      tier: 4,
      replacedAt: null,
      source: "队伍表!J43",
      note: "Earlier superseded interpretation",
      people: pair.map(
        (p: { osuId: number; username: string; source: string }) => ({
          osuId: p.osuId,
          username: p.username,
          source: p.source.split("; ")[1],
        }),
      ),
    },
  ];
  return saved;
}

it("corrects saved S6 imports for all readers, preserving evidence and publication", () => {
  const saved = legacyImport();
  const original = structuredClone(saved);
  const corrected = historicalArchiveSchema.parse(saved);
  const expected = historicalArchiveSchema.parse(
    JSON.parse(readFileSync("docs/imports/s6-confirmed-archive.json", "utf8")),
  );
  expect({
    ...corrected,
    players: [...corrected.players].sort((a, b) => a.osuId - b.osuId),
  }).toEqual({
    ...expected,
    players: [...expected.players].sort((a, b) => a.osuId - b.osuId),
  });
  expect(saved).toEqual(original);
  expect(historicalArchiveSchema.parse(corrected)).toEqual(corrected);
  expect(
    publicHistoricalArchive(corrected).players.filter(
      (p) => p.teamId === "team-k" && p.tier === 4,
    ),
  ).toHaveLength(2);
  expect(publicHistoricalArchive(corrected).matches).toEqual([]);
  expect(corrected.matches).toEqual(saved.matches);
});

it("leaves other editions, sources and actual replacement histories intact", () => {
  for (const change of [
    { editionSlug: "another-season" },
    { sourceUrl: "https://example.com/other-source" },
    {
      formatVersion: 2,
      rosterReplacements: [
        { ...legacyImport().rosterReplacements[0], id: "actual-history" },
      ],
    },
  ]) {
    const saved = { ...legacyImport(), ...change };
    expect(historicalArchiveSchema.parse(saved)).toEqual(saved);
  }
});
