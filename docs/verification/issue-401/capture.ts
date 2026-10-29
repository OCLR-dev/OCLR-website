import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { chromium } from "@playwright/test";
import { db, closeDb } from "../../../src/db";
import { historicalStatistics } from "../../../src/db/schema";
import { statisticsArchiveKey } from "../../../src/lib/archive-statistics";
import { historicalArchiveSchema } from "../../../src/lib/historical-archive";
import { seedEditions } from "../../../tests/fixtures/editions";
import { edition } from "../../../tests/fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../../../tests/fixtures/archive-statistics";
import { historicalArchive } from "../../../tests/fixtures/historical-archive";
import { assertTestDatabase } from "../../../tests/database";

assertTestDatabase(process.env.TEST_DATABASE_URL);
assertTestDatabase(process.env.DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)
  throw new Error(
    "Capture requires the same explicit disposable test database.",
  );

const archive = structuredClone(statisticsArchive);
archive.editionSlug = "s1";
archive.matches.push({
  ...archive.matches[0],
  id: "uncovered",
  label: "Synthetic uncovered match",
  stage: "Semi",
  mpUrls: [],
});
const draft = {
  ...structuredClone(historicalArchive),
  editionSlug: "notes-s5-test",
  formatVersion: 2 as const,
  draftMode: "final-tiers" as const,
  picks: [],
};
const s8 = historicalArchiveSchema.parse(
  JSON.parse(readFileSync("docs/imports/s8-archive.json", "utf8")),
);
await seedEditions([
  {
    ...edition,
    slug: "s1",
    name: "Synthetic S1 statistics",
    season: "1",
    published: true,
    status: "completed",
    registration: null,
    archive,
  },
  {
    ...edition,
    slug: draft.editionSlug,
    name: "Synthetic S5 allocations",
    season: "5",
    published: true,
    status: "completed",
    registration: null,
    archive: draft,
  },
  {
    ...edition,
    slug: "notes-s8-test",
    name: "OCLR S8",
    season: "8",
    published: true,
    status: "completed",
    registration: null,
    archive: { ...s8, editionSlug: "notes-s8-test" },
  },
]);
const source = statisticsSource();
source.games = source.games.slice(0, 2);
const snapshot = {
  archiveKey: statisticsArchiveKey(archive),
  source,
  poolId: "final",
  included: [1, 2],
};
await db()
  .delete(historicalStatistics)
  .where(eq(historicalStatistics.editionSlug, "s1"));
await db()
  .insert(historicalStatistics)
  .values({
    editionSlug: "s1",
    fixtureId: "one",
    mpId: source.match.id,
    version: 1,
    draft: snapshot,
    published: snapshot,
    publishedAt: new Date("2026-10-23T00:00:00Z"),
  });
await closeDb();

const browser = await chromium.launch();
const paths = [
  ["s1-statistics", "/tournaments/s1/statistics"],
  ["s5-draft", "/tournaments/notes-s5-test/draft"],
  ["s8-schedule", "/tournaments/notes-s8-test/schedule"],
];
mkdirSync("docs/verification/issue-401", { recursive: true });
for (const [version, root, port] of [
  ["before", "../OCLR-issue401-before", 31401],
  ["after", ".", 31402],
] as const) {
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, APP_URL: `http://127.0.0.1:${port}` },
    },
  );
  try {
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(`http://127.0.0.1:${port}/tournaments`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    for (const [device, viewport] of [
      ["desktop", { width: 1440, height: 950 }],
      ["mobile", { width: 390, height: 844 }],
    ] as const) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
      });
      await context.addCookies(
        [
          ["oclr-locale", "en"],
          ["oclr-theme", "light"],
        ].map(([name, value]) => ({
          name,
          value,
          url: `http://127.0.0.1:${port}`,
        })),
      );
      const page = await context.newPage();
      for (const [name, path] of paths) {
        await page.goto(`http://127.0.0.1:${port}${path}`);
        await page.locator("main").waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `docs/verification/issue-401/${name}-${device}-${version}.png`,
          fullPage: true,
        });
        console.log(version, device, name, await page.title());
      }
      await context.close();
    }
  } finally {
    server.kill();
  }
}
await browser.close();
