import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  registrations,
  registrationEvents,
  staffRoles,
  editionState,
  userProfileCache,
} from "../../src/db/schema";
import { addManualRegistration } from "../../src/lib/manual-registrations";
import { submitRegistration } from "../../src/lib/registrations";
import { reviewApplication } from "../../src/lib/staff";
import { applicationDetails } from "../../src/lib/staff-registration-reads";
import { tournamentCommand } from "../../src/lib/tournaments";
import { noEligibilityLimits } from "../../src/lib/eligibility-model";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
import { osuApi } from "../../src/lib/osu-api";
const provider = vi.mocked(osuApi),
  url = process.env.TEST_DATABASE_URL;
const user = { osuId: 997001, username: "Synthetic eligibility" };
const limited = {
  ...edition,
  rules: null,
  eligibility: null,
  automaticEligibility: { ...noEligibilityLimits, maxPp: 8000, minRank: 10000 },
};
const input = { configurationVersion: 0, answers: {} };
describe.skipIf(!url)("authoritative registration eligibility", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(user.osuId));
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
  });
  beforeEach(async () => {
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedEditions([
      limited,
      { ...limited, slug: "unrestricted-test", automaticEligibility: null },
    ]);
    await db().insert(users).values(user);
    provider.mockReset().mockResolvedValue({
      id: user.osuId,
      username: user.username,
      statistics: { pp: 7999, global_rank: 10000 },
    });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("allows only rank-only failures inside an explicitly configured grace range to reach manual review", async () => {
    provider.mockResolvedValue({
      id: user.osuId,
      username: user.username,
      statistics: { pp: 7999, global_rank: 9500 },
    });
    await expect(
      submitRegistration(user, edition.slug, input),
    ).rejects.toMatchObject({ status: 400 });
    await seedEditions([
      { ...limited, rankGraceRange: { minRank: 9000, maxRank: 9999 } },
    ]);
    const saved = await submitRegistration(user, edition.slug, input);
    expect(saved.status).toBe("pending");
    expect(saved.eligibilityVerification).toMatchObject({
      status: "fail",
      rank: 9500,
      rankGraceRange: { minRank: 9000, maxRank: 9999 },
    });
    await db().delete(registrations);
    await db().delete(userProfileCache);
    provider.mockResolvedValue({
      id: user.osuId,
      username: user.username,
      statistics: { pp: 8001, global_rank: 9500 },
    });
    await expect(
      submitRegistration(user, edition.slug, input),
    ).rejects.toMatchObject({ status: 400 });
    await db().delete(userProfileCache);
    provider.mockResolvedValue({
      id: user.osuId,
      username: user.username,
      statistics: { pp: 7999, global_rank: 8999 },
    });
    await expect(
      submitRegistration(user, edition.slug, input),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("persists verified inputs and rejects forgery, failure and unavailable snapshots", async () => {
    await expect(
      submitRegistration(user, edition.slug, { ...input, pp: 1 }),
    ).rejects.toMatchObject({ status: 400 });
    const saved = await submitRegistration(user, edition.slug, input);
    expect(saved.eligibilityVerification).toMatchObject({
      status: "pass",
      pp: 7999,
      rank: 10000,
      mode: "osu",
      configurationVersion: 0,
      userId: user.osuId,
    });
    expect(provider).toHaveBeenCalledWith(`/users/${user.osuId}/osu?key=id`);
    await db().delete(registrations);
    await db().delete(userProfileCache);
    provider.mockResolvedValue({
      id: user.osuId,
      username: user.username,
      statistics: { pp: 8001, global_rank: 10000 },
    });
    await expect(
      submitRegistration(user, edition.slug, input),
    ).rejects.toMatchObject({ status: 400 });
    await db().delete(userProfileCache);
    provider.mockRejectedValue(new Error("Synthetic outage"));
    await expect(
      submitRegistration(user, edition.slug, input),
    ).rejects.toMatchObject({ status: 503 });
    expect(await db().select().from(registrations)).toHaveLength(0);
    expect(
      (await submitRegistration(user, "unrestricted-test", input))
        .eligibilityVerification,
    ).toBeNull();
  });
  it("rejects a changed edition after provider I/O and never alters existing accepted players", async () => {
    provider.mockImplementationOnce(async () => {
      await db()
        .update(editionState)
        .set({ configurationVersion: 1 })
        .where(eq(editionState.slug, edition.slug));
      return {
        id: user.osuId,
        username: user.username,
        statistics: { pp: 7999, global_rank: 10000 },
      };
    });
    await expect(
      submitRegistration(user, edition.slug, input),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db().select().from(registrations)).toHaveLength(0);
  });
  it("keeps the verified submission snapshot when a review audit rolls back and is retried", async () => {
    const reviewer = { osuId: 997002, username: "Synthetic Reviewer" };
    await db().insert(users).values(reviewer);
    await db().insert(staffRoles).values({
      userId: reviewer.osuId,
      role: "admin",
      editionSlug: edition.slug,
      grantedBy: user.osuId,
    });
    const saved = await submitRegistration(user, edition.slug, input);
    const changed = await tournamentCommand(user, edition.slug, {
      action: "schedule",
      expectedRevision: 0,
      confirmed: true,
      schedule: [{ label: "Synthetic later milestone", at: null }],
    });
    expect(changed.revision).toBe(1);

    const before = await applicationDetails(reviewer, saved.id);
    expect(before.acknowledgedConfiguration?.schedule).toEqual(limited.schedule);
    expect(before.registration).toMatchObject({
      configurationVersion: 0,
      eligibilityVerification: { status: "pass", configurationVersion: 0 },
    });
    const review = () =>
      reviewApplication(reviewer, saved.id, {
        status: "accepted",
        expectedUpdatedAt: saved.updatedAt.toISOString(),
        confirmed: true,
      });
    const events = () =>
      db()
        .select()
        .from(registrationEvents)
        .where(eq(registrationEvents.registrationId, saved.id));

    await db().execute(sql`
      CREATE FUNCTION oclr_test_reject_review_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.to_status = 'accepted' THEN
          RAISE EXCEPTION 'Synthetic review audit failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER oclr_test_reject_review_audit
        BEFORE INSERT ON registration_events FOR EACH ROW
        EXECUTE FUNCTION oclr_test_reject_review_audit()
    `);
    try {
      await expect(review()).rejects.toThrow();
      expect(await applicationDetails(reviewer, saved.id)).toEqual(before);
      expect(await events()).toHaveLength(1);
    } finally {
      await db().execute(sql`
        DROP TRIGGER oclr_test_reject_review_audit ON registration_events;
        DROP FUNCTION oclr_test_reject_review_audit()
      `);
    }
    const accepted = await review();
    expect(accepted).toMatchObject({
      status: "accepted",
      configurationVersion: 0,
      eligibilityVerification: before.registration.eligibilityVerification,
    });
    expect(
      (await applicationDetails(reviewer, saved.id)).acknowledgedConfiguration,
    ).toEqual(before.acknowledgedConfiguration);
    const history = await events();
    expect(history).toHaveLength(2);
    expect(history).toContainEqual(
      expect.objectContaining({
        actorId: reviewer.osuId,
        fromStatus: "pending",
        toStatus: "accepted",
        attempt: saved.attempt,
      }),
    );
  });
  it("requires an explicit manual exception and preserves a failed check as staff_override", async () => {
    provider.mockResolvedValue({
      id: user.osuId,
      username: user.username,
      statistics: { pp: 8001, global_rank: 10000 },
    });
    const input = {
      input: String(user.osuId),
      expectedRevision: 0,
      status: "accepted",
      publicationAcknowledged: true,
      confirmed: true,
    };
    await expect(
      addManualRegistration(user, edition.slug, input),
    ).rejects.toMatchObject({ status: 409 });
    const saved = await addManualRegistration(user, edition.slug, {
      ...input,
      overrideEligibility: true,
    });
    expect(saved.eligibilityVerification).toMatchObject({
      status: "staff_override",
      pp: 8001,
      rank: 10000,
    });
    expect(
      saved.eligibilityVerification?.comparisons.some(
        (c) => c.passed === false,
      ),
    ).toBe(true);
    expect(saved.status).toBe("accepted");
  });
});
