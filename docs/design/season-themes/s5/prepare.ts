// Disposable design fixture only. Never approves source results or seeds a live edition.
import { readFileSync } from "node:fs";
import { assertTestDatabase } from "../../../../tests/database";
import { seedEditions } from "../../../../tests/fixtures/editions";
import { edition } from "../../../../tests/fixtures/edition";
import { closeDb } from "../../../../src/db";
import { historicalArchiveSchema } from "../../../../src/lib/historical-archive";

assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
try {
  const archive = historicalArchiveSchema.parse(
    JSON.parse(
      readFileSync(
        new URL("../../../imports/s5-reviewed-import.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const rulebook = JSON.parse(
    readFileSync(
      new URL("../../../imports/s5-rulebook.json", import.meta.url),
      "utf8",
    ),
  );
  await seedEditions([
    {
      ...edition,
      slug: "s5",
      season: "5",
      name: "OCLR β (S5)",
      published: true,
      status: "completed",
      summary: "osu! Chinese League Rookie — OCLR β (S5).",
      registration: null,
      rules: { version: rulebook.version, sections: rulebook.sections },
      eligibility: null,
      schedule: [],
      archive,
    },
  ]);
  console.log(
    "Prepared isolated S5 design fixture; pending source results remain unapproved and follow the existing public projection.",
  );
} finally {
  await closeDb();
}
