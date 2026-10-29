// Disposable design preview. Minimum schema-required synthetic identities, explicitly labelled.
import { readFileSync } from "node:fs";
import { assertTestDatabase } from "../../../../tests/database";
import { seedEditions } from "../../../../tests/fixtures/editions";
import { edition } from "../../../../tests/fixtures/edition";
import { closeDb } from "../../../../src/db";
import { historicalArchiveSchema } from "../../../../src/lib/historical-archive";
assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
try {
  const rules = JSON.parse(
    readFileSync(
      new URL("../../../imports/s1-rules.json", import.meta.url),
      "utf8",
    ),
  ) as { title: string; content: string }[];
  const archive = historicalArchiveSchema.parse({
    formatVersion: 1,
    editionSlug: "s1",
    sourceUrl:
      "https://docs.google.com/spreadsheets/d/10OvY6V2_nJpmv3LekQJZw6Eo5Hy1V-ggSoOQIxIdm6I",
    capturedOn: "2026-10-29",
    notes: [],
    links: [],
    teams: [
      {
        id: "preview-only",
        name: "Synthetic UI Preview — not historical data",
        source: "Isolated design fixture: schema requires one team",
      },
    ],
    players: [
      {
        osuId: 92001,
        username: "Synthetic UI Preview captain",
        teamId: "preview-only",
        role: "captain",
        tier: 0,
        source: "Synthetic design fixture",
      },
    ],
    matches: [],
    pools: [],
    standings: [],
    staff: [],
    picks: [],
  });
  await seedEditions([
    {
      ...edition,
      slug: "s1",
      season: "1",
      name: "OCLR S1",
      published: true,
      status: "completed",
      summary:
        "S1 design preview — historical data unavailable in this isolated fixture.",
      branding: {
        logo: null,
        background: null,
        keyVisual: "/archive/s1/key-visual.webp",
      },
      registration: null,
      eligibility: null,
      schedule: [],
      rules: {
        version: "S1 source rules",
        sections: rules.map((r) => ({ heading: r.title, body: r.content })),
      },
      archive,
    },
  ]);
  console.log("Prepared isolated S1 design fixture and source rules.");
} finally {
  await closeDb();
}
