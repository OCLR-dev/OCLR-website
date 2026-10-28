// Disposable preview fixtures only; never an application seed or live approval.
import { readFileSync } from "node:fs";
import { assertTestDatabase } from "../../../../tests/database";
import { seedEditions } from "../../../../tests/fixtures/editions";
import { edition } from "../../../../tests/fixtures/edition";
import { closeDb } from "../../../../src/db";
import {
  historicalArchiveSchema,
  approveArchiveMatches,
} from "../../../../src/lib/historical-archive";

assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
try {
  const archive = historicalArchiveSchema.parse(
    JSON.parse(
      readFileSync(
        new URL("../../../imports/s6-confirmed-archive.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  // Mirror the existing S6 presentation fixture and the dated organizer evidence.
  // This changes only this explicitly isolated fixture, never the source JSON.
  const publicFixture = approveArchiveMatches(
    archive,
    archive.matches.map((m) => m.id),
    {
      approvedOn: "2026-10-25",
      source:
        "Synthetic UI fixture of organizer-attested S6 approval; docs/s6-archive.md",
    },
  );
  await seedEditions([
    {
      ...edition,
      slug: "s6",
      season: "6",
      name: "OCLR Season 6",
      published: true,
      status: "completed",
      summary: "osu! Chinese League Rookie — Season 6. 2021 年歷史賽事歸檔。",
      registration: null,
      rules: JSON.parse(
        readFileSync(
          new URL("../../../imports/s6-configured-rules.json", import.meta.url),
          "utf8",
        ),
      ),
      eligibility: null,
      schedule: [],
      archive: publicFixture,
    },
  ]);
  console.log(
    "Prepared committed S6 public archive, four rule chapters and 33 recorded-match fixtures in the isolated test database.",
  );
} finally {
  await closeDb();
}
