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
      slug: "s9",
      season: "9",
      name: "OCLR Season 9",
      published: true,
      status: "completed",
      // Literal public caption from the organizer's annotated page.
      summary: "osu! Chinese League Rookie — Season 9. 2023 年歷史賽事歸檔。",
      registration: null,
      rules: null,
      eligibility: null,
      schedule: [],
      archive: JSON.parse(
        readFileSync(
          new URL("../../../imports/s9-archive.json", import.meta.url),
          "utf8",
        ),
      ),
    },
  ]);
  console.log(
    "Prepared public repository S9 archive in the explicit test database.",
  );
} finally {
  await closeDb();
}
