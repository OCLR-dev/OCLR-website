import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  editionState,
  fixtures,
  mappools,
  resultAuditEvents,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedResultReview } from "../fixtures/results";
import { publicNews, publicNewsItem } from "../../src/lib/public-news";
import { matchReview, resultCommand } from "../../src/lib/results";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 481001, username: "Synthetic News Admin" };
const referee = { osuId: 481002, username: "Synthetic News Referee" };
describe.skipIf(!url)("published News sources and retraction", () => {
  beforeEach(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await db().insert(users).values([admin, referee]);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("projects only published pools/fixtures and approved published results without writing on reads", async () => {
    const seed = await seedResultReview(
      admin.osuId,
      referee.osuId,
      482000,
      "knockout",
      true,
    );
    const now = new Date("2030-01-01T00:00:00Z");
    const initial = await publicNews(now);
    expect(initial.some((i) => i.kind === "mappool")).toBe(true);
    expect(initial.some((i) => i.kind === "fixture")).toBe(true);
    expect(initial.some((i) => i.kind === "result")).toBe(false);
    let review = await matchReview(admin, "test-cup", seed.fixtureId);
    async function command(extra: Record<string, unknown>) {
      review = (
        await resultCommand(admin, "test-cup", seed.fixtureId, {
          ...extra,
          expectedVersion: review.context.result!.version,
          expectedFixtureVersion: review.context.fixture.version,
          requestKey: randomUUID(),
          confirmed: true,
        })
      ).review;
    }
    await command({
      action: "submit",
      importId: seed.importId,
      rulesConfirmed: true,
      sourceChangesConfirmed: true,
      publicNote: "",
      decisions: seed.source.games.map((g) => ({
        gameId: g.id,
        included: true,
        complianceConfirmed: true,
        reason: "",
        substitutions: [],
      })),
    });
    expect((await publicNews(now)).some((i) => i.kind === "result")).toBe(
      false,
    );
    await command({ action: "approve", revision: 1 });
    expect((await publicNews(now)).some((i) => i.kind === "result")).toBe(
      false,
    );
    await command({
      action: "publish",
      revision: 1,
      progressionAcknowledged: true,
    });
    const published = await publicNews(now);
    expect(published.filter((i) => i.kind === "result")).toHaveLength(1);
    expect(published.find((i) => i.kind === "result")?.summary).toContain(
      "2–1",
    );
    const item = published.find((i) => i.kind === "result")!;
    expect(item.summary).toContain("Synthetic Review Round");
    expect(item.summary).not.toMatch(/revision|version/i);
    expect(item.title).toContain("Synthetic test edition");
    expect(item.source?.url).toBe(
      `/tournaments/test-cup/matches/${seed.fixtureId}`,
    );
    await db()
      .update(editionState)
      .set({
        configuration: sql`jsonb_set(configuration, '{season}', '"10"'::jsonb)`,
      })
      .where(eq(editionState.slug, "test-cup"));
    expect(await publicNewsItem(item.slug, now)).toBeUndefined();
    expect(
      (await publicNews(now)).some((entry) =>
        entry.source?.url.startsWith("/tournaments/test-cup/"),
      ),
    ).toBe(false);
    await db()
      .update(editionState)
      .set({
        configuration: sql`jsonb_set(configuration, '{season}', '"11"'::jsonb)`,
      })
      .where(eq(editionState.slug, "test-cup"));
    expect(await publicNewsItem(item.slug, now)).toEqual(item);
    await command({
      action: "submit",
      importId: seed.importId,
      rulesConfirmed: true,
      sourceChangesConfirmed: true,
      publicNote: "Synthetic reviewed update",
      decisions: seed.source.games.map((g) => ({
        gameId: g.id,
        included: true,
        complianceConfirmed: true,
        reason: "",
        substitutions: [],
      })),
    });
    await command({ action: "approve", revision: 2 });
    expect((await publicNews(now)).find((i) => i.kind === "result")).toEqual(
      item,
    );
    await command({
      action: "publish",
      revision: 2,
      progressionAcknowledged: true,
    });
    const republished = await publicNews(now);
    const updated = republished.find((i) => i.kind === "result")!;
    expect(updated.slug).toBe(item.slug);
    expect(updated.summary).toBe(item.summary);
    expect(Date.parse(updated.at)).toBeGreaterThanOrEqual(Date.parse(item.at));
    const audit = await db().select().from(resultAuditEvents);
    expect(await publicNews(now)).toEqual(republished);
    expect(await db().select().from(resultAuditEvents)).toEqual(audit);
    expect(JSON.stringify(published)).not.toMatch(
      /fingerprint|rosterSnapshot|sourceChangesConfirmed|grantedBy|private note/,
    );
    await db()
      .update(mappools)
      .set({ publishedAt: null })
      .where(eq(mappools.id, seed.poolId!));
    expect((await publicNews(now)).some((i) => i.kind === "mappool")).toBe(
      false,
    );
    await command({ action: "unpublish" });
    expect((await publicNews(now)).some((i) => i.kind === "result")).toBe(
      false,
    );
    await db()
      .update(fixtures)
      .set({ publishedAt: null })
      .where(eq(fixtures.id, seed.fixtureId));
    expect((await publicNews(now)).some((i) => i.kind === "fixture")).toBe(
      false,
    );
    await db()
      .update(editionState)
      .set({
        configuration: sql`jsonb_set(configuration, '{published}', 'false')`,
      })
      .where(eq(editionState.slug, "test-cup"));
    expect(await publicNews(now)).toEqual([]);
  });
});
