import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  badgeReviews,
  editionEvents,
  registrations,
  staffRoles,
  users,
} from "../../src/db/schema";
import { staffBws, reviewBws, profileBws } from "../../src/lib/bws";
import { publishedPlayerProfile } from "../../src/lib/player-profiles";
import { getOsuUserProfile, PROFILE_TTL_MS } from "../../src/lib/osu-profiles";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { profileResponse } from "../fixtures/osu-profile";
import { POST as reviewRoute } from "../../src/app/api/admin/tournaments/[edition]/registrations/[id]/bws/route";
import { reviewBwsWrite } from "../../src/lib/bws-write-contract";
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => actor,
}));
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
import { osuApi } from "../../src/lib/osu-api";
const provider = vi.mocked(osuApi);
const url = process.env.TEST_DATABASE_URL;
const origin = "https://oclr.example.test";
const actor = { osuId: 991001, username: "Synthetic BWS Admin" },
  player = 991002;
const badges = [
  "Synthetic standard tournament",
  "Synthetic taiko tournament",
  "Synthetic contributor award",
].map((description) => ({
  description,
  awarded_at: "2026-01-01T00:00:00Z",
  url: "https://osu.ppy.sh/wiki/en/Tournaments",
}));
describe.skipIf(!url)("scoped BWS review and public projection", () => {
  let id: string;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("ADMIN_OSU_IDS", String(actor.osuId));
  });
  beforeEach(async () => {
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedEditions([edition, { ...edition, slug: "other-test-cup" }]);
    await db()
      .insert(users)
      .values([actor, { osuId: player, username: "Synthetic BWS Player" }]);
    const [row] = await db()
      .insert(registrations)
      .values({
        editionSlug: edition.slug,
        userId: player,
        status: "accepted",
        rulesVersion: null,
        answers: {},
      })
      .returning();
    id = row.id;
    provider.mockReset().mockResolvedValue({
      ...profileResponse,
      id: player,
      badges,
      statistics: { global_rank: 10000, pp: 1234.567 },
    });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function command() {
    const view = await staffBws(actor, edition.slug, id, "osu");
    return {
      mode: "osu",
      fingerprint: view.fingerprint,
      expectedVersion: view.version,
      classifications: ["osu", "other", "other"],
      confirmed: true,
    };
  }
  it("starts pending and uses only cached mode-matching reviewed badges in public and staff views", async () => {
    const pending = await staffBws(actor, edition.slug, id, "osu");
    expect(
      (await staffBws(actor, edition.slug, id, undefined)).summary,
    ).toEqual(pending.summary);
    expect(pending.summary).toMatchObject({
      status: "pending",
      value: null,
      badgeCount: null,
    });
    const input = await command();
    const review = (command = input) =>
      reviewRoute(
        new Request(
          origin +
            reviewBwsWrite.path
              .replace("{edition}", edition.slug)
              .replace("{id}", id),
          {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify(command),
          },
        ),
        { params: Promise.resolve({ edition: edition.slug, id }) },
      );
    expect(
      (await review({ ...input, classifications: ["taiko", "other", "osu"] }))
        .status,
    ).toBe(400);
    const response = await review();
    expect(response.status).toBe(200);
    const body = await response.json();
    const reviewed = reviewBwsWrite.response.parse(body);
    expect(reviewed).toEqual(body);
    const stale = await review();
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      error: "Badge review changed. Reload before continuing.",
    });
    expect(reviewed.summary).toMatchObject({
      status: "ready",
      badgeCount: 1,
      value: 10000 ** 0.9937,
      rawPp: 1234.567,
      adjustedPp: 1234.567 ** 1.0063,
      ppStatus: "ready",
    });
    const publicData = await publishedPlayerProfile(
      String(player),
      "osu",
      edition.slug,
    );
    expect(publicData.bws).toEqual(reviewed.summary);
    expect(JSON.stringify(publicData)).not.toMatch(
      /PRIVATE_BWS_EVIDENCE|reviewedBy|classifications|fingerprint/,
    );
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      (await publishedPlayerProfile(String(player), "taiko", edition.slug)).bws,
    ).toBeNull();
    expect(
      (await profileBws(reviewed.snapshot, "other-test-cup"))?.status,
    ).toBe("pending");
    expect((await db().select().from(registrations))[0].status).toBe(
      "accepted",
    );
  });
  it("accepts default osu and rejects other modes with correct scope and current Admin grants", async () => {
    await expect(
      staffBws(actor, edition.slug, id, "taiko"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      staffBws(actor, "other-test-cup", id, "osu"),
    ).rejects.toMatchObject({ status: 404 });
    const operator = { osuId: 991003, username: "Synthetic Scoped" };
    await db().insert(users).values(operator);
    for (const role of ["mappooler", "referee"] as const) {
      await db().insert(staffRoles).values({
        userId: operator.osuId,
        role,
        editionSlug: edition.slug,
        grantedBy: actor.osuId,
      });
      await expect(
        staffBws(operator, edition.slug, id, "osu"),
      ).rejects.toMatchObject({ status: 403 });
    }
    const [grant] = await db()
      .insert(staffRoles)
      .values({
        userId: operator.osuId,
        role: "admin",
        editionSlug: edition.slug,
        grantedBy: actor.osuId,
      })
      .returning();
    await staffBws(operator, edition.slug, id, "osu");
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.id, grant.id));
    await expect(
      reviewBws(operator, edition.slug, id, await command()),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db().select().from(badgeReviews)).toHaveLength(0);
  });
  it("serializes concurrent reviews and rejects stale inventories/versions without false audit", async () => {
    const input = await command();
    const responses = await Promise.allSettled([
      reviewBws(actor, edition.slug, id, input),
      reviewBws(actor, edition.slug, id, input),
    ]);
    expect(
      responses.filter((r) => r.status === "fulfilled"),
      responses
        .filter((r) => r.status === "rejected")
        .map((r) => String(r.reason))
        .join("; "),
    ).toHaveLength(1);
    expect(await db().select().from(badgeReviews)).toHaveLength(1);
    expect(
      await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.kind, "registration_badge_review")),
    ).toHaveLength(1);
    await expect(
      reviewBws(actor, edition.slug, id, {
        ...input,
        expectedVersion: 1,
        fingerprint: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await db().execute(
      sql`UPDATE user_profile_cache SET retry_at = NOW() - INTERVAL '1 minute', profile = jsonb_set(profile, '{fetchedAt}', to_jsonb(${new Date(Date.now() - PROFILE_TTL_MS - 1000).toISOString()}::text))`,
    );
    provider.mockResolvedValue({
      ...profileResponse,
      id: player,
      badges: badges.slice(1),
      statistics: { global_rank: 10000, pp: 1234.567 },
    });
    const fresh = await getOsuUserProfile(player, "osu");
    expect((await profileBws(fresh, edition.slug))?.value).toBeNull();
    await expect(
      reviewBws(actor, edition.slug, id, { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not publish pending registrations and treats omitted/partial badges as unknown", async () => {
    await db()
      .update(registrations)
      .set({ status: "pending" })
      .where(eq(registrations.id, id));
    await expect(
      publishedPlayerProfile(String(player), "osu", edition.slug),
    ).rejects.toMatchObject({ status: 404 });
    provider.mockResolvedValue({
      ...profileResponse,
      id: player,
      badges: [{}],
    });
    const view = await staffBws(actor, edition.slug, id, "osu");
    expect(view.summary.badgeCount).toBeNull();
    await expect(
      reviewBws(actor, edition.slug, id, {
        ...(await command()),
        classifications: [],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back classification if its audit write fails", async () => {
    const input = await command();
    await db().execute(
      sql`CREATE FUNCTION test_reject_bws_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'registration_badge_review' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_reject_bws_audit BEFORE INSERT ON edition_events FOR EACH ROW EXECUTE FUNCTION test_reject_bws_audit()`,
    );
    try {
      await expect(reviewBws(actor, edition.slug, id, input)).rejects.toThrow();
      expect(await db().select().from(badgeReviews)).toHaveLength(0);
    } finally {
      await db().execute(
        sql`DROP TRIGGER test_reject_bws_audit ON edition_events; DROP FUNCTION test_reject_bws_audit()`,
      );
    }
  });
});
