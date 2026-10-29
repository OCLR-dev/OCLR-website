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
        new URL("../../../imports/s4-archive.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const rulebook = JSON.parse(
    readFileSync(
      new URL("../../../imports/s4-rules.json", import.meta.url),
      "utf8",
    ),
  );
  await seedEditions([
    {
      ...edition,
      slug: "s4",
      season: "4",
      name: "OCLR Season 4",
      published: true,
      status: "completed",
      summary: "osu! Chinese League Rookie — Season 4.",
      registration: null,
      rules: {
        version: "OCLR S4规则说明（原文分段）",
        sections: rulebook.map(
          ({ title, content }: { title: string; content: string }) => ({
            heading: title,
            body: content,
          }),
        ),
      },
      eligibility: null,
      schedule: [],
      archive,
    },
  ]);
  console.log(
    "Prepared isolated S4 design fixture; all committed review statuses and the existing public projection remain unchanged.",
  );
} finally {
  await closeDb();
}
