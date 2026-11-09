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
  users,
  registrations,
  registrationEvents,
  userProfileCache,
  editionState,
  draftSessions,
  staffRoles,
  sessions,
} from "../../src/db/schema";
import {
  addManualRegistration,
  previewManualRegistration,
  previewManualRegistrations,
  addManualRegistrations,
} from "../../src/lib/manual-registrations";
import { ownRegistrations } from "../../src/lib/registration-reads";
import {
  submitRegistration,
  withdrawRegistration,
} from "../../src/lib/registrations";
import { playerApplications } from "../../src/lib/dashboard";
import { publicPlayer } from "../../src/lib/players";
import { auditLog } from "../../src/lib/audit";
import { createSession } from "../../src/lib/auth/sessions";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { applicationQuestions } from "../fixtures/application-questions";
import { profileResponse } from "../fixtures/osu-profile";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { HttpError } from "../../src/lib/http";
import { assertTestDatabase } from "../database";
import { POST as addOne } from "../../src/app/api/admin/tournaments/[edition]/registrations/route";
import { POST as previewOne } from "../../src/app/api/admin/tournaments/[edition]/registrations/preview/route";
import { POST as addBatch } from "../../src/app/api/admin/tournaments/[edition]/registrations/batch/route";
import { POST as previewBatch } from "../../src/app/api/admin/tournaments/[edition]/registrations/batch/preview/route";
import {
  addManualRegistrationWrite,
  addManualRegistrationsWrite,
  previewManualRegistrationWrite,
  previewManualRegistrationsWrite,
} from "../../src/lib/manual-registration-write-contract";

vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => admin,
}));
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
import { osuApi } from "../../src/lib/osu-api";
const provider = vi.mocked(osuApi);
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 979999, username: "Synthetic manual Admin" };
const playerId = profileResponse.id;
const origin = "https://oclr.example.test";
function post(
  route: (...args: Parameters<typeof addOne>) => Promise<Response>,
  path: string,
  body: unknown,
) {
  return route(
    new Request(origin + path.replace("{edition}", edition.slug), {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ edition: edition.slug }) },
  );
}
function bulkProvider() {
  provider.mockImplementation(async (path) => {
    const name = /^\/users\/@(.+)\/osu$/.exec(path);
    const named = name ? decodeURIComponent(name[1]) : null;
    const namedId =
      named === "260001"
        ? 260002
        : named?.toLowerCase() === "[space name]"
          ? 260003
          : null;
    const id = named ? namedId : Number(/^\/users\/(\d+)\//.exec(path)?.[1]);
    if (!id)
      throw new (await import("../../src/lib/http")).HttpError(
        404,
        "This osu! profile is unavailable.",
      );
    return {
      ...profileResponse,
      id,
      username:
        id === 260002
          ? "260001"
          : id === 260003
            ? "[Space Name]"
            : `Synthetic ${id}`,
    };
  });
}
async function cacheFormerName(osuId: number, retryAt?: Date) {
  const fetchedAt = new Date(Date.now() - 2 * 60_000);
  await db()
    .insert(userProfileCache)
    .values({
      osuId,
      mode: "osu",
      profile: normalizeOsuProfile(
        { ...profileResponse, id: osuId, username: "Former Name" },
        osuId,
        "osu",
        fetchedAt.toISOString(),
      ),
      attemptedAt: fetchedAt,
      retryAt: retryAt ?? fetchedAt,
    });
}
const command = {
  input: String(playerId),
  expectedRevision: 0,
  status: "pending",
  confirmed: true,
};
describe.skipIf(!url)("staff-assisted registration integrity", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedEditions([edition, { ...edition, slug: "other-test-cup" }]);
    await db().insert(users).values(admin);
    provider.mockReset().mockResolvedValue(profileResponse);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("previews an official identity without creating users, registrations or sessions", async () => {
    const response = await post(
      previewOne,
      previewManualRegistrationWrite.path,
      {
        input: `https://osu.ppy.sh/users/${playerId}/osu`,
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const preview = previewManualRegistrationWrite.response.parse(body);
    expect(preview).toEqual(body);
    expect(preview.profile.username).toBe(profileResponse.username);
    expect(preview.edition).toMatchObject({
      slug: edition.slug,
      revision: 0,
      outsideWindow: false,
    });
    expect(provider).toHaveBeenCalledWith(`/users/${playerId}/osu?key=id`);
    expect(await db().select().from(registrations)).toEqual([]);
    expect(
      await db().select().from(users).where(eq(users.osuId, playerId)),
    ).toEqual([]);
    expect(await db().select().from(sessions)).toEqual([]);
  });
  it("adds Pending with truthful provenance, revision and no player acknowledgments", async () => {
    await seedEditions([
      {
        ...edition,
        registration: {
          ...edition.registration,
          questions: applicationQuestions,
        },
      },
    ]);
    const response = await post(
      addOne,
      addManualRegistrationWrite.path,
      command,
    );
    expect(response.status).toBe(201);
    const receipt = await response.json();
    expect(addManualRegistrationWrite.response.parse(receipt)).toEqual(receipt);
    expect(receipt).toEqual({
      id: expect.any(String),
      userId: playerId,
      status: "pending",
    });
    const [row] = await db()
      .select()
      .from(registrations)
      .where(eq(registrations.id, receipt.id));
    expect(row).toMatchObject({
      userId: playerId,
      source: "staff",
      status: "pending",
      configurationVersion: 0,
      rulesVersion: null,
      eligibilityAcknowledged: null,
      answers: {},
    });
    expect(await publicPlayer(playerId, edition.slug)).toEqual([]);
    const [event] = await db().select().from(registrationEvents);
    expect(event).toMatchObject({
      registrationId: row.id,
      actorId: admin.osuId,
      fromStatus: null,
      toStatus: "pending",
      reason: null,
    });
    const log = await auditLog(admin, {
      edition: edition.slug,
      module: "registrations",
    });
    expect(JSON.stringify(log)).toContain('"registrationSource":"staff"');
    expect(await db().select().from(sessions)).toHaveLength(0);
  });
  it("requires explicit Accepted publication approval and exposes identity only in the chosen edition", async () => {
    await expect(
      addManualRegistration(admin, edition.slug, {
        ...command,
        status: "accepted",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(registrations)).toEqual([]);
    await addManualRegistration(admin, edition.slug, {
      ...command,
      status: "accepted",
      publicationAcknowledged: true,
    });
    expect(await publicPlayer(playerId, edition.slug)).toHaveLength(1);
    expect(await publicPlayer(playerId, "other-test-cup")).toHaveLength(0);
    expect(
      (await db().execute(sql`SELECT COUNT(*)::int AS n FROM captains`)).rows[0]
        .n,
    ).toBe(0);
    expect(
      (await db().execute(sql`SELECT COUNT(*)::int AS n FROM memberships`))
        .rows[0].n,
    ).toBe(0);
  });
  it("uses stable identity ownership on real session creation and preserves normal withdrawal", async () => {
    const row = await addManualRegistration(admin, edition.slug, command);
    await createSession(playerId);
    expect(await ownRegistrations(playerId)).toHaveLength(1);
    expect((await playerApplications(playerId))[0].registration.source).toBe(
      "staff",
    );
    await expect(
      submitRegistration(
        { osuId: playerId, username: profileResponse.username },
        edition.slug,
        {
          configurationVersion: 0,
          rulesAcknowledged: true,
          eligibilityAcknowledged: true,
          rulesVersion: "test-v1",
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    await withdrawRegistration(
      { osuId: playerId, username: profileResponse.username },
      row.id,
      { confirmed: true },
    );
    expect((await ownRegistrations(playerId))[0].status).toBe("withdrawn");
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("commits one concurrent/retried entry and one audit event without duplicate users", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        addManualRegistration(admin, edition.slug, command),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((x) => x.status === "rejected")
        .every((x) => x.status === "rejected" && x.reason.status === 409),
    ).toBe(true);
    expect(await db().select().from(registrationEvents)).toHaveLength(1);
    expect(
      await db().select().from(users).where(eq(users.osuId, playerId)),
    ).toHaveLength(1);
    await db().update(registrations).set({ status: "rejected" });
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("requires a deliberate late-entry exception without reopening public registration", async () => {
    const closed = {
      ...edition,
      registration: {
        ...edition.registration!,
        closesAt: "2025-02-01T00:00:00Z",
      },
    };
    await seedEditions([closed]);
    expect(
      (
        await previewManualRegistration(admin, edition.slug, {
          input: command.input,
        })
      ).edition.outsideWindow,
    ).toBe(true);
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      addManualRegistration(admin, edition.slug, {
        ...command,
        overrideWindow: true,
        exceptionReason: " ",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await addManualRegistration(admin, edition.slug, {
      ...command,
      overrideWindow: true,
      exceptionReason: "Organizer-approved late entry",
    });
    expect((await db().select().from(registrationEvents))[0].reason).toBe(
      "Organizer-approved late entry",
    );
    expect(
      (
        await db()
          .select()
          .from(editionState)
          .where(eq(editionState.slug, edition.slug))
      )[0].configuration?.registration?.closesAt,
    ).toBe(closed.registration.closesAt);
    expect(await publicPlayer(playerId, edition.slug)).toEqual([]);
  });
  it("rejects locked, completed, active/finalized drafts and stale revisions", async () => {
    await expect(
      addManualRegistration(admin, edition.slug, {
        ...command,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await db()
      .update(editionState)
      .set({ lockedAt: new Date() })
      .where(eq(editionState.slug, edition.slug));
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 409 });
    await db()
      .update(editionState)
      .set({ lockedAt: null })
      .where(eq(editionState.slug, edition.slug));
    await seedEditions([{ ...edition, status: "completed" }]);
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 409 });
    await seedEditions([edition]);
    for (const state of [
      "ready",
      "live",
      "paused",
      "completed",
      "finalized",
    ] as const) {
      await db()
        .insert(draftSessions)
        .values({ editionSlug: edition.slug, state })
        .onConflictDoUpdate({
          target: draftSessions.editionSlug,
          set: { state },
        });
      await expect(
        addManualRegistration(admin, edition.slug, command),
      ).rejects.toMatchObject({ status: 409 });
    }
    expect(await db().select().from(registrationEvents)).toEqual([]);
  });
  it("enforces scoped roles, role revocation and strict commands before provider access", async () => {
    const staff = { osuId: 979998, username: "Synthetic scoped Admin" };
    await db().insert(users).values(staff);
    for (const role of ["mappooler", "referee"] as const) {
      await db().insert(staffRoles).values({
        userId: staff.osuId,
        role,
        editionSlug: edition.slug,
        grantedBy: admin.osuId,
      });
    }
    await expect(
      previewManualRegistration(staff, edition.slug, { input: command.input }),
    ).rejects.toMatchObject({ status: 403 });
    await db().insert(staffRoles).values({
      userId: staff.osuId,
      role: "admin",
      editionSlug: "other-test-cup",
      grantedBy: admin.osuId,
    });
    await expect(
      addManualRegistration(staff, edition.slug, command),
    ).rejects.toMatchObject({ status: 403 });
    const [grant] = await db()
      .insert(staffRoles)
      .values({
        userId: staff.osuId,
        role: "admin",
        editionSlug: edition.slug,
        grantedBy: admin.osuId,
      })
      .returning();
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.id, grant.id));
    await expect(
      addManualRegistration(staff, edition.slug, command),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      addManualRegistration(admin, edition.slug, {
        ...command,
        userId: playerId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(provider).not.toHaveBeenCalled();
  });
  it("rejects invalid/nonexistent/upstream-unavailable identities and privacy failures", async () => {
    for (const input of [
      "https://evil.test/users/123",
      "https://osu.ppy.sh/users/name",
      "0",
      "1e3",
    ])
      await expect(
        previewManualRegistration(admin, edition.slug, { input }),
      ).rejects.toMatchObject({ status: 400 });
    expect(provider).not.toHaveBeenCalled();
    provider.mockRejectedValue(
      new (await import("../../src/lib/http")).HttpError(404, "missing"),
    );
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 404 });
    await db().delete(userProfileCache);
    provider.mockRejectedValue(new Error("provider unavailable"));
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 502 });
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "");
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(admin.osuId));
    expect(await db().select().from(registrations)).toEqual([]);
  });
  it("refuses stale fallback identity after a provider failure without erasing the cached profile", async () => {
    const snapshot = await previewManualRegistration(admin, edition.slug, {
      input: command.input,
    });
    await db().execute(
      sql`UPDATE user_profile_cache SET profile = jsonb_set(profile, '{fetchedAt}', to_jsonb('2020-01-01T00:00:00.000Z'::text)), retry_at = NOW() - INTERVAL '1 minute'`,
    );
    provider.mockRejectedValue(new Error("Synthetic provider outage"));
    await expect(
      addManualRegistration(admin, edition.slug, command),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      (await db().select().from(userProfileCache))[0].profile?.username,
    ).toBe(snapshot.profile.username);
    expect(await db().select().from(registrations)).toEqual([]);
    expect(
      await db().select().from(users).where(eq(users.osuId, playerId)),
    ).toEqual([]);
  });
  it("rechecks scoped authorization after provider I/O", async () => {
    const actor = {
      osuId: 979997,
      username: "Synthetic revoked during lookup",
    };
    await db().insert(users).values(actor);
    const [grant] = await db()
      .insert(staffRoles)
      .values({
        userId: actor.osuId,
        role: "admin",
        editionSlug: edition.slug,
        grantedBy: admin.osuId,
      })
      .returning();
    provider.mockImplementationOnce(async () => {
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.id, grant.id));
      return profileResponse;
    });
    await expect(
      previewManualRegistration(actor, edition.slug, { input: command.input }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db().select().from(registrations)).toEqual([]);
    expect(await db().select().from(registrationEvents)).toEqual([]);
  });
  it("rolls back user, enrollment and audit atomically if the event write fails", async () => {
    await db().execute(
      sql`CREATE FUNCTION test_reject_manual_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER test_manual_audit_failure BEFORE INSERT ON registration_events FOR EACH ROW EXECUTE FUNCTION test_reject_manual_audit()`,
    );
    try {
      await expect(
        addManualRegistration(admin, edition.slug, command),
      ).rejects.toThrow();
      expect(
        await db().select().from(users).where(eq(users.osuId, playerId)),
      ).toEqual([]);
      expect(await db().select().from(registrations)).toEqual([]);
      expect(await db().select().from(registrationEvents)).toEqual([]);
    } finally {
      await db().execute(
        sql`DROP TRIGGER test_manual_audit_failure ON registration_events`,
      );
      await db().execute(sql`DROP FUNCTION test_reject_manual_audit()`);
    }
  });
  it("retains historical player acknowledgments and rejects fabricated staff consent at the database boundary", async () => {
    await db()
      .insert(users)
      .values({ osuId: playerId, username: profileResponse.username });
    const [old] = await db()
      .insert(registrations)
      .values({
        editionSlug: edition.slug,
        userId: playerId,
        rulesVersion: "test-v1",
        eligibilityAcknowledged: true,
        configurationVersion: 0,
        answers: {},
      })
      .returning();
    expect(old.source).toBe("player");
    await expect(
      db()
        .update(registrations)
        .set({ source: "staff" })
        .where(eq(registrations.id, old.id)),
    ).rejects.toThrow();
    expect((await ownRegistrations(playerId))[0].rulesVersion).toBe("test-v1");
  });
  it("disambiguates numeric usernames, preserves spaces/special characters and rejects historical-name guesses", async () => {
    bulkProvider();
    const numericName = await previewManualRegistration(admin, edition.slug, {
      input: "260001",
      inputType: "username",
    });
    expect(numericName.profile.osuId).toBe(260002);
    expect(
      (
        await previewManualRegistration(admin, edition.slug, {
          input: "260001",
          inputType: "id",
        })
      ).profile.osuId,
    ).toBe(260001);
    const spaced = await previewManualRegistration(admin, edition.slug, {
      input: " [space NAME] ",
      inputType: "username",
    });
    expect(spaced.profile.username).toBe("[Space Name]");
    expect(provider).toHaveBeenCalledWith("/users/@%5Bspace%20NAME%5D/osu");
    provider.mockResolvedValue({
      ...profileResponse,
      username: "Renamed Player",
      previous_usernames: ["Old Player"],
    });
    await expect(
      previewManualRegistration(admin, edition.slug, {
        input: "Old Player",
        inputType: "username",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db().select().from(registrations)).toEqual([]);
  });
  it.each(["single", "batch"] as const)(
    "refreshes a cached former name before returning a %s preview of the current name",
    async (kind) => {
      const osuId = kind === "single" ? 350001 : 350002;
      const username = `${kind} Current Name`;
      await cacheFormerName(osuId);
      provider.mockResolvedValue({ ...profileResponse, id: osuId, username });
      const preview =
        kind === "single"
          ? await previewManualRegistration(admin, edition.slug, {
              input: username,
              inputType: "username",
            })
          : (
              await previewManualRegistrations(admin, edition.slug, {
                text: `name: ${username}`,
                inputType: "username",
              })
            ).rows[0].preview;
      expect(preview?.profile).toMatchObject({ osuId, username });
      expect(provider.mock.calls.map(([path]) => path)).toEqual([
        `/users/@${encodeURIComponent(username)}/osu`,
        `/users/${osuId}/osu?key=id`,
      ]);
      const [cached] = await db().select().from(userProfileCache);
      expect(cached.profile?.username).toBe(username);
      expect(await db().select().from(registrations)).toEqual([]);
      expect(await db().select().from(registrationEvents)).toEqual([]);
      expect(await db().select().from(users)).toEqual([
        expect.objectContaining({ osuId: admin.osuId }),
      ]);
    },
  );
  it("keeps rename refresh failures unavailable and respects shared retry backoff", async () => {
    const osuId = 350003;
    const username = "Unavailable Rename";
    await cacheFormerName(osuId);
    provider.mockImplementation(async (path) => {
      if (path.startsWith("/users/@"))
        return { ...profileResponse, id: osuId, username };
      throw new HttpError(502, "Synthetic provider outage");
    });
    const lookup = { input: username, inputType: "username" };
    await expect(
      previewManualRegistration(admin, edition.slug, lookup),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      previewManualRegistration(admin, edition.slug, lookup),
    ).rejects.toMatchObject({ status: 503 });
    expect(provider).toHaveBeenCalledTimes(2);
    const [cached] = await db().select().from(userProfileCache);
    expect(cached.profile?.username).toBe("Former Name");
    expect(cached.errorStatus).toBe(502);
    expect(await db().select().from(registrations)).toEqual([]);
  });
  it("respects a recent profile refresh cooldown for a renamed player", async () => {
    const osuId = 350004;
    const username = "Busy Rename";
    await cacheFormerName(osuId, new Date(Date.now() + 60_000));
    provider.mockResolvedValue({ ...profileResponse, id: osuId, username });
    await expect(
      previewManualRegistration(admin, edition.slug, {
        input: username,
        inputType: "username",
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await db().select().from(registrations)).toEqual([]);
  });
  it("still rejects a name that differs from the refreshed official identity", async () => {
    const osuId = 350005;
    const username = "Changed Again";
    await cacheFormerName(osuId);
    provider.mockImplementation(async (path) => ({
      ...profileResponse,
      id: osuId,
      username: path.startsWith("/users/@") ? username : "Newest Name",
    }));
    await expect(
      previewManualRegistration(admin, edition.slug, {
        input: username,
        inputType: "username",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(await db().select().from(registrations)).toEqual([]);
  });
  it("previews mixed lines without writes and deduplicates by stable ID across name, ID and URL", async () => {
    bulkProvider();
    const response = await post(
      previewBatch,
      previewManualRegistrationsWrite.path,
      {
        text: "\nname: [Space Name]\nid: 260003\nhttps://osu.ppy.sh/users/260003\nname: missing\nname: 260001",
        inputType: "username",
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const result = previewManualRegistrationsWrite.response.parse(body);
    expect(result).toEqual(body);
    expect(result.rows.map((r) => [r.line, r.state])).toEqual([
      [2, "ready"],
      [3, "duplicate"],
      [4, "duplicate"],
      [5, "failed"],
      [6, "ready"],
    ]);
    expect(result.rows[0].raw).toBe("name: [Space Name]");
    expect(result.rows[0].preview?.profile.osuId).toBe(260003);
    expect(await db().select().from(registrations)).toEqual([]);
    expect(await db().select().from(registrationEvents)).toEqual([]);
    expect(await db().select().from(users)).toEqual([
      expect.objectContaining({ osuId: admin.osuId }),
    ]);
  });
  it("preserves all existing statuses and links their records without restoring or overwriting", async () => {
    bulkProvider();
    for (const [index, status] of (
      ["pending", "accepted", "rejected", "withdrawn"] as const
    ).entries()) {
      const id = 270001 + index;
      await db()
        .insert(users)
        .values({ osuId: id, username: `Existing ${id}` });
      await db()
        .insert(registrations)
        .values({ editionSlug: edition.slug, userId: id, status, answers: {} });
    }
    const before = await db().select().from(registrations);
    const preview = await previewManualRegistrations(admin, edition.slug, {
      text: "270001\n270002\n270003\n270004",
      inputType: "id",
    });
    expect(
      preview.rows.every(
        (r) => r.state === "existing" && r.preview?.existing?.id,
      ),
    ).toBe(true);
    const replay = await addManualRegistrations(admin, edition.slug, {
      expectedRevision: 0,
      status: "pending",
      confirmed: true,
      rows: before.map((r, index) => ({ line: index + 1, osuId: r.userId })),
    });
    expect(replay.counts).toEqual({ added: 0, skipped: 4, failed: 0 });
    expect(await db().select().from(registrations)).toEqual(before);
    expect(await db().select().from(registrationEvents)).toEqual([]);
  });
  it("reports a 20-player batch accurately, serializes lookups, skips duplicate retries and commits one event per player", async () => {
    bulkProvider();
    let active = 0,
      peak = 0;
    const resolve = provider.getMockImplementation()!;
    provider.mockImplementation(async (...args) => {
      peak = Math.max(peak, ++active);
      try {
        return await resolve(...args);
      } finally {
        active--;
      }
    });
    const ids = Array.from({ length: 20 }, (_, i) => 280001 + i);
    const preview = await previewManualRegistrations(admin, edition.slug, {
      text: ids.join("\n"),
      inputType: "id",
    });
    expect(preview.rows.every((r) => r.state === "ready")).toBe(true);
    expect(peak).toBe(1);
    const payload = {
      expectedRevision: 0,
      status: "pending",
      confirmed: true,
      rows: ids.map((osuId, i) => ({ line: i + 1, osuId })),
    };
    const responses = await Promise.all([
      post(addBatch, addManualRegistrationsWrite.path, payload),
      post(addBatch, addManualRegistrationsWrite.path, payload),
    ]);
    const results = await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(200);
        const body = await response.json();
        const result = addManualRegistrationsWrite.response.parse(body);
        expect(result).toEqual(body);
        expect(
          result.results
            .filter((row) => row.state === "added")
            .every((row) => row.overrideEligibility === false),
        ).toBe(true);
        return result;
      }),
    );
    expect(results.reduce((n, r) => n + r.counts.added, 0)).toBe(20);
    expect(results.reduce((n, r) => n + r.counts.skipped, 0)).toBe(20);
    expect(await db().select().from(registrations)).toHaveLength(20);
    expect(await db().select().from(registrationEvents)).toHaveLength(20);
    expect(
      (await addManualRegistrations(admin, edition.slug, payload)).counts,
    ).toEqual({ added: 0, skipped: 20, failed: 0 });
  });
  it("keeps partial successes and rolls back a failed player's identity, enrollment and audit together", async () => {
    bulkProvider();
    await db().execute(
      sql`CREATE FUNCTION test_batch_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT user_id FROM registrations WHERE id = NEW.registration_id) = 290002 THEN RAISE EXCEPTION 'Synthetic row failure'; END IF; RETURN NEW; END $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER test_batch_audit_failure BEFORE INSERT ON registration_events FOR EACH ROW EXECUTE FUNCTION test_batch_audit()`,
    );
    const payload = {
      expectedRevision: 0,
      status: "pending",
      confirmed: true,
      rows: [
        { line: 1, osuId: 290001 },
        { line: 2, osuId: 290002 },
      ],
    };
    try {
      const result = await addManualRegistrations(admin, edition.slug, payload);
      expect(result.counts).toEqual({ added: 1, skipped: 0, failed: 1 });
      expect(result.results.map((r) => r.state)).toEqual(["added", "failed"]);
      expect(
        await db().select().from(users).where(eq(users.osuId, 290002)),
      ).toEqual([]);
      expect(await db().select().from(registrationEvents)).toHaveLength(1);
    } finally {
      await db().execute(
        sql`DROP TRIGGER test_batch_audit_failure ON registration_events`,
      );
      await db().execute(sql`DROP FUNCTION test_batch_audit()`);
    }
    const retry = await addManualRegistrations(admin, edition.slug, payload);
    expect(retry.counts).toEqual({ added: 1, skipped: 1, failed: 0 });
    expect(await db().select().from(registrationEvents)).toHaveLength(2);
  });
  it("rejects stale batch revisions before identity I/O and never writes during a changed preview", async () => {
    bulkProvider();
    await expect(
      addManualRegistrations(admin, edition.slug, {
        expectedRevision: 9,
        status: "pending",
        confirmed: true,
        rows: [{ line: 1, osuId: 300001 }],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(provider).not.toHaveBeenCalled();
    const resolve = provider.getMockImplementation()!;
    provider.mockImplementationOnce(async (...args) => {
      await db()
        .update(editionState)
        .set({ configurationVersion: 1 })
        .where(eq(editionState.slug, edition.slug));
      return resolve(...args);
    });
    await expect(
      previewManualRegistrations(admin, edition.slug, {
        text: "300001\n300002",
        inputType: "id",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db().select().from(registrations)).toEqual([]);
  });
  it("retains batch publication, late-window and per-player eligibility confirmations", async () => {
    bulkProvider();
    await seedEditions([
      {
        ...edition,
        automaticEligibility: {
          minPp: null,
          maxPp: 100,
          minRank: null,
          maxRank: null,
        },
        registration: {
          ...edition.registration,
          closesAt: "2025-02-01T00:00:00Z",
        },
      },
    ]);
    const payload = {
      expectedRevision: 0,
      status: "accepted",
      confirmed: true,
      rows: [
        { line: 1, osuId: 310001 },
        { line: 2, osuId: 310002, overrideEligibility: true },
      ],
    };
    await expect(
      addManualRegistrations(admin, edition.slug, payload),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      addManualRegistrations(admin, edition.slug, {
        ...payload,
        publicationAcknowledged: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const preview = await previewManualRegistrations(admin, edition.slug, {
      text: "310001\n310002",
      inputType: "id",
    });
    expect(preview.rows[0].preview?.verification?.status).toBe("fail");
    const result = await addManualRegistrations(admin, edition.slug, {
      ...payload,
      publicationAcknowledged: true,
      overrideWindow: true,
      exceptionReason: "Synthetic approved late entry",
    });
    expect(result.counts).toEqual({ added: 1, skipped: 0, failed: 1 });
    const [saved] = await db().select().from(registrations);
    expect(saved).toMatchObject({
      userId: 310002,
      source: "staff",
      rulesVersion: null,
      eligibilityAcknowledged: null,
      answers: {},
      eligibilityVerification: { status: "staff_override" },
    });
    expect(await publicPlayer(310001, edition.slug)).toHaveLength(0);
    expect(await publicPlayer(310002, edition.slug)).toHaveLength(1);
  });
  it("bounds batch inputs and rejects unauthorized/cross-edition, locked and completed requests", async () => {
    const actor = { osuId: 320001, username: "Synthetic non-admin" };
    await db().insert(users).values(actor);
    for (const slug of [edition.slug, "other-test-cup"])
      await expect(
        previewManualRegistrations(actor, slug, { text: "1", inputType: "id" }),
      ).rejects.toMatchObject({ status: 403 });
    for (const text of ["", "1\n".repeat(21), "a".repeat(8193)])
      await expect(
        previewManualRegistrations(admin, edition.slug, {
          text,
          inputType: "id",
        }),
      ).rejects.toMatchObject({ status: 400 });
    const payload = {
      expectedRevision: 0,
      status: "pending",
      confirmed: true,
      rows: [{ line: 1, osuId: 320002 }],
    };
    await expect(
      addManualRegistrations(actor, edition.slug, payload),
    ).rejects.toMatchObject({ status: 403 });
    for (const status of ["locked", "completed"]) {
      if (status === "locked")
        await db().update(editionState).set({ lockedAt: new Date() });
      else {
        await db().update(editionState).set({ lockedAt: null });
        await seedEditions([{ ...edition, status: "completed" }]);
      }
      await expect(
        addManualRegistrations(admin, edition.slug, payload),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        previewManualRegistrations(admin, edition.slug, {
          text: "1",
          inputType: "id",
        }),
      ).rejects.toMatchObject({ status: 409 });
    }
    expect(provider).not.toHaveBeenCalled();
  });
  it("keeps rate limits, timeouts and unavailable profiles as per-row failures without unverified enrollment", async () => {
    bulkProvider();
    const resolve = provider.getMockImplementation()!;
    provider.mockImplementation(async (...args) => {
      const { HttpError } = await import("../../src/lib/http");
      if (args[0].includes("330002"))
        throw new HttpError(
          429,
          "Profile refresh is busy. Please retry in a few minutes.",
        );
      if (args[0].includes("330003"))
        throw new HttpError(
          502,
          "osu! is temporarily unreachable. Saved data has not changed.",
        );
      if (args[0].includes("330004"))
        return { ...profileResponse, id: 330004, is_restricted: true };
      return resolve(...args);
    });
    const preview = await previewManualRegistrations(admin, edition.slug, {
      text: "330001\n330002\n330003\n330004",
      inputType: "id",
    });
    expect(preview.rows.map((r) => r.state)).toEqual([
      "ready",
      "failed",
      "failed",
      "failed",
    ]);
    expect(await db().select().from(registrations)).toEqual([]);
    const saved = await addManualRegistrations(admin, edition.slug, {
      expectedRevision: 0,
      status: "pending",
      confirmed: true,
      rows: [330001, 330002, 330003, 330004].map((osuId, i) => ({
        line: i + 1,
        osuId,
      })),
    });
    expect(saved.counts).toEqual({ added: 1, skipped: 0, failed: 3 });
    expect(await db().select().from(registrationEvents)).toHaveLength(1);
  });
  it("stops later writes after a scoped operator loses permission during a batch", async () => {
    const actor = { osuId: 340000, username: "Synthetic batch Admin" };
    await db().insert(users).values(actor);
    const [grant] = await db()
      .insert(staffRoles)
      .values({
        userId: actor.osuId,
        editionSlug: edition.slug,
        role: "admin",
        grantedBy: admin.osuId,
      })
      .returning();
    bulkProvider();
    const resolve = provider.getMockImplementation()!;
    provider.mockImplementation(async (...args) => {
      if (args[0].includes("340002"))
        await db()
          .update(staffRoles)
          .set({ revokedAt: new Date() })
          .where(eq(staffRoles.id, grant.id));
      return resolve(...args);
    });
    const result = await addManualRegistrations(actor, edition.slug, {
      expectedRevision: 0,
      status: "pending",
      confirmed: true,
      rows: [340001, 340002, 340003].map((osuId, i) => ({
        line: i + 1,
        osuId,
      })),
    });
    expect(result.counts).toEqual({ added: 1, skipped: 0, failed: 2 });
    expect(
      (await db().select().from(registrations)).map((r) => r.userId),
    ).toEqual([340001]);
    expect(await db().select().from(registrationEvents)).toHaveLength(1);
  });
});
