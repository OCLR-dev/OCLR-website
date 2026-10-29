import { readFileSync } from "node:fs";
import { assertTestDatabase } from "../../../../tests/database";
import { seedEditions } from "../../../../tests/fixtures/editions";
import { edition } from "../../../../tests/fixtures/edition";
import { closeDb } from "../../../../src/db";
assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const rules = JSON.parse(
  readFileSync(
    new URL("../../../imports/s2-rules.json", import.meta.url),
    "utf8",
  ),
);
try {
  await seedEditions([
    {
      ...edition,
      slug: "s2",
      season: "2",
      name: "OCLR S2",
      published: true,
      status: "completed",
      summary: "Synthetic UI Preview · S2 主題設計樣本，非歷史資料快照。",
      registration: null,
      eligibility: null,
      schedule: [],
      rules: {
        version: "s2-preview",
        sections: rules.map((r: { title: string; content: string }) => ({
          heading: r.title,
          body: r.content,
        })),
      },
      archive: {
        formatVersion: 2,
        editionSlug: "s2",
        sourceUrl:
          "https://docs.google.com/spreadsheets/d/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY",
        capturedOn: "2026-10-29",
        notes: [
          "Synthetic UI Preview; archive records unavailable in this fixture.",
        ],
        links: [],
        teams: [
          {
            id: "synthetic",
            name: "Synthetic UI Preview",
            source: "Design fixture only",
          },
        ],
        players: [
          {
            osuId: 60002,
            username: "Synthetic Captain",
            teamId: "synthetic",
            role: "captain",
            tier: 0,
            source: "Design fixture only",
          },
        ],
        picks: [],
        staff: [],
        standings: [],
        matches: [],
        pools: [],
      },
    },
  ]);
} finally {
  await closeDb();
}
