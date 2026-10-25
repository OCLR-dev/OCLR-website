import { assertTestDatabase } from "../database";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  editionState,
  registrations,
  registrationEvents,
  users,
} from "../../src/db/schema";
import {
  applicationDetails,
  listApplications,
  reviewApplication,
} from "../../src/lib/staff";
const url = process.env.TEST_DATABASE_URL;
const staff = { osuId: 50001, username: "Synthetic Staff" };
const player = { osuId: 50002, username: "=Synthetic Player" };
describe.skipIf(!url)("staff review boundaries and concurrency", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(staff.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await db().insert(users).values([staff, player]);
    await db().insert(editionState).values({ slug: "test-cup" });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function application() {
    return (
      await db()
        .insert(registrations)
        .values({
          userId: player.osuId,
          editionSlug: "test-cup",
          answers: { private: "Do not export" },
          rulesVersion: "test-v1",
        })
        .returning()
    )[0];
  }
  it("keeps deferred applications private, filterable and auditable through final review", async () => {
    let r = await application();
    const initial = r.updatedAt.toISOString();
    r = await reviewApplication(staff, r.id, {
      status: "deferred",
      confirmed: true,
      expectedUpdatedAt: initial,
    });
    expect(r.status).toBe("deferred");
    expect((await listApplications(staff, { status: "deferred" })).total).toBe(
      1,
    );
    await expect(
      reviewApplication(staff, r.id, {
        status: "accepted",
        confirmed: true,
        expectedUpdatedAt: initial,
      }),
    ).rejects.toMatchObject({ status: 409 });
    r = await reviewApplication(staff, r.id, {
      status: "pending",
      confirmed: true,
      expectedUpdatedAt: r.updatedAt.toISOString(),
    });
    r = await reviewApplication(staff, r.id, {
      status: "deferred",
      confirmed: true,
      expectedUpdatedAt: r.updatedAt.toISOString(),
    });
    r = await reviewApplication(staff, r.id, {
      status: "accepted",
      confirmed: true,
      expectedUpdatedAt: r.updatedAt.toISOString(),
    });
    await expect(
      reviewApplication(staff, r.id, {
        status: "deferred",
        confirmed: true,
        expectedUpdatedAt: r.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await db().select().from(registrationEvents)).map((e) => e.toStatus),
    ).toEqual(["deferred", "pending", "deferred", "accepted"]);
  });
  it("rejects nonstaff across listing, details, exports and mutations", async () => {
    const r = await application();
    await expect(listApplications(player, {})).rejects.toMatchObject({
      status: 403,
    });
    await expect(listApplications(player, {}, true)).rejects.toMatchObject({
      status: 403,
    });
    await expect(applicationDetails(player, r.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(reviewApplication(player, r.id, {})).rejects.toMatchObject({
      status: 403,
    });
  });
  it("filters by edition/status/identity and excludes answers from export data", async () => {
    const r = await application();
    expect(
      (
        await listApplications(staff, {
          q: String(player.osuId),
          edition: "test-cup",
          status: "pending",
        })
      ).total,
    ).toBe(1);
    expect(
      (await listApplications(staff, { status: "accepted" })).rows,
    ).toHaveLength(0);
    // LIKE wildcards in the search box match literally.
    for (const [q, total] of [
      ["Synthetic", 1],
      ["_", 0],
      ["%", 0],
      ["Synthetic_Player", 0],
    ] as const)
      expect((await listApplications(staff, { q, status: "" })).total).toBe(
        total,
      );
    expect(
      JSON.stringify(await listApplications(staff, {}, true)),
    ).not.toContain("Do not export");
    expect(
      (await applicationDetails(staff, r.id)).registration.answers.private,
    ).toBe("Do not export");
  });
  it("commits one concurrent review and records actual actor and before/after state", async () => {
    const r = await application();
    const payload = {
      status: "accepted",
      expectedUpdatedAt: r.updatedAt.toISOString(),
      confirmed: true,
    };
    const results = await Promise.allSettled([
      reviewApplication(staff, r.id, payload),
      reviewApplication(staff, r.id, {
        ...payload,
        status: "rejected",
        reason: "Synthetic explanation",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const events = await db().select().from(registrationEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: staff.osuId,
      fromStatus: "pending",
    });
    await expect(reviewApplication(staff, r.id, payload)).rejects.toMatchObject(
      { status: 409 },
    );
  });
  it("requires rejection reasons and rejects forged audit fields or stale versions", async () => {
    const r = await application();
    const payload = {
      status: "rejected",
      expectedUpdatedAt: r.updatedAt.toISOString(),
      confirmed: true,
    };
    await expect(reviewApplication(staff, r.id, payload)).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(
      reviewApplication(staff, r.id, {
        ...payload,
        reason: "Test",
        actorId: player.osuId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      reviewApplication(staff, r.id, {
        ...payload,
        reason: "Test",
        expectedUpdatedAt: new Date(0).toISOString(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
