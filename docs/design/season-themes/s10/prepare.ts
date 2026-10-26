// Disposable UI capture fixtures only. Never an application seed or auth bypass.
import { readFileSync } from "node:fs";
import { assertTestDatabase } from "../../../../tests/database";
import { seedEditions } from "../../../../tests/fixtures/editions";
import { edition } from "../../../../tests/fixtures/edition";
import { closeDb } from "../../../../src/db";
assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
try {
  await seedEditions([
    {
      ...edition,
      slug: "s10",
      season: "10",
      name: "OCLR Season 10",
      published: true,
      status: "completed",
      summary: "Design preview using the committed S10 archive.",
      registration: null,
      rules: null,
      eligibility: null,
      schedule: [],
      archive: JSON.parse(
        readFileSync(
          new URL("../../../imports/s10-archive.json", import.meta.url),
          "utf8",
        ),
      ),
    },
  ]);
  console.log(
    "Prepared public repository S10 archive in the explicit test database.",
  );
} finally {
  await closeDb();
}
