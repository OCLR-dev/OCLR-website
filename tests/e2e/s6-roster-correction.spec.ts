import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { editionState } from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";

test.describe("S6 Team K saved roster correction", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("shows both T4s as regular players from a legacy saved import", async ({
    page,
  }) => {
    const archive = JSON.parse(
      readFileSync("docs/imports/s6-confirmed-archive.json", "utf8"),
    );
    const people = archive.players.filter((p: { osuId: number }) =>
      [8425774, 14947596].includes(p.osuId),
    );
    archive.players = archive.players.filter(
      (p: { osuId: number }) => ![8425774, 14947596].includes(p.osuId),
    );
    archive.rosterReplacements = [
      {
        id: "team-k-tier-4-history",
        teamId: "team-k",
        tier: 4,
        replacedAt: null,
        source: "队伍表!J43",
        note: "Superseded interpretation",
        people: people.map(
          (p: { osuId: number; username: string; source: string }) => ({
            osuId: p.osuId,
            username: p.username,
            source: p.source.split("; ")[1],
          }),
        ),
      },
    ];
    await seedEditions([
      {
        ...edition,
        slug: "s6",
        name: "Synthetic S6 correction",
        published: true,
        status: "completed",
        registration: null,
      },
    ]);
    // Store the legacy form directly, exercising the real persisted read path.
    await db()
      .update(editionState)
      .set({
        configuration: sql`jsonb_set(${editionState.configuration}, '{archive}', ${JSON.stringify(archive)}::jsonb)`,
      })
      .where(eq(editionState.slug, "s6"));
    await page.goto("/tournaments/s6/teams/team-k");
    for (const name of ["Name-Less-", "PhantoMPainN"]) {
      const card = page
        .locator('.archive-player-card[data-role="player"]')
        .filter({ hasText: name });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText("Tier 4");
    }
    await expect(
      page.locator(".archive-team-section .archive-player-card"),
    ).toHaveCount(7);
  });
});
