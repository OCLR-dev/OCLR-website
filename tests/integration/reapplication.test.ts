import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  registrations,
  registrationAttempts,
  registrationEvents,
  users,
  captains,
} from "../../src/db/schema";
import {
  submitRegistration,
  withdrawRegistration,
} from "../../src/lib/registrations";
import { ownRegistrations } from "../../src/lib/registration-reads";
import {
  changeRegistrationParticipation,
  reviewApplication,
} from "../../src/lib/staff";
import { applicationDetails } from "../../src/lib/staff-registration-reads";
import { tournamentCommand } from "../../src/lib/tournaments";
import { readTournament } from "../../src/lib/tournament-reads";
import { publicPlayers } from "../../src/lib/players";
import { auditLog } from "../../src/lib/audit";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { applicationQuestions } from "../fixtures/application-questions";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 116001, username: "Synthetic Admin" },
  player = { osuId: 116002, username: "Synthetic Player" },
  other = { osuId: 116003, username: "Synthetic Other" };
const input = {
  configurationVersion: 0,
  rulesAcknowledged: true,
  eligibilityAcknowledged: true,
  rulesVersion: "test-v1",
  answers: {},
};
const confirm = (r: { updatedAt: Date }) => ({
  confirmed: true,
  expectedUpdatedAt: r.updatedAt.toISOString(),
});
const reapply = (
  r: { updatedAt: Date; attempt: number },
  overrides: object = {},
) => ({
  ...input,
  reapply: { attempt: r.attempt, expectedUpdatedAt: r.updatedAt.toISOString() },
  ...overrides,
});
describe.skipIf(!url)(
  "player reapplication with immutable attempt history",
  () => {
    beforeAll(() => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(admin.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      await seedEditions([edition, { ...edition, slug: "other-test-cup" }]);
      await db().insert(users).values([admin, player, other]);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    async function withdrawn() {
      const r = await submitRegistration(player, edition.slug, input);
      return withdrawRegistration(player, r.id, { confirmed: true });
    }
    it("reapplies to the current questions/rules, archives earlier answers and returns only Pending until fresh review", async () => {
      const old = await withdrawn();
      const current = (await readTournament(edition.slug))!;
      const revised = await tournamentCommand(admin, edition.slug, {
        action: "registration",
        expectedRevision: current.revision,
        confirmed: true,
        registration: {
          ...current.edition.registration,
          questions: applicationQuestions,
        },
      });
      const next = await submitRegistration(
        player,
        edition.slug,
        reapply(old, {
          configurationVersion: revised.revision,
          answers: { availability: "weekend" },
        }),
      );
      expect(next).toMatchObject({
        id: old.id,
        status: "pending",
        source: "player",
        attempt: 2,
        configurationVersion: revised.revision,
        answers: { introduction: "", availability: "weekend", preference: "" },
      });
      expect(next.createdAt.getTime()).toBeGreaterThan(old.createdAt.getTime());
      expect((await publicPlayers({ edition: edition.slug })).rows).toEqual([]);
      const detail = await applicationDetails(admin, old.id);
      expect(detail.attempts[0].snapshot).toMatchObject({
        status: "withdrawn",
        answers: {},
        rulesVersion: "test-v1",
        attempt: 1,
        source: "player",
      });
      expect(
        (await db().select().from(registrationEvents)).map((e) => [
          e.attempt,
          e.operation,
        ]),
      ).toEqual([
        [1, null],
        [1, "player_withdraw"],
        [2, "player_reapply"],
      ]);
      await reviewApplication(admin, next.id, {
        ...confirm(next),
        status: "accepted",
      });
      expect(
        (await publicPlayers({ edition: edition.slug })).rows,
      ).toHaveLength(1);
    });
    it("records a staff-created/removed registrant's genuine player attempt without inventing prior acknowledgments", async () => {
      const [manual] = await db()
        .insert(registrations)
        .values({
          userId: player.osuId,
          editionSlug: edition.slug,
          source: "staff",
          status: "accepted",
          answers: {},
          configurationVersion: 0,
        })
        .returning();
      const removed = await changeRegistrationParticipation(
        admin,
        edition.slug,
        manual.id,
        "remove",
        confirm(manual),
      );
      const saved = await submitRegistration(
        player,
        edition.slug,
        reapply({ ...removed, attempt: 1 }),
      );
      expect(saved).toMatchObject({
        source: "player",
        rulesVersion: "test-v1",
        eligibilityAcknowledged: true,
        status: "pending",
        attempt: 2,
      });
      expect(
        (await db().select().from(registrationAttempts))[0].snapshot,
      ).toMatchObject({
        source: "staff",
        rulesVersion: null,
        eligibilityAcknowledged: null,
        answers: {},
      });
      const audit = await auditLog(admin, { module: "registrations" });
      expect(
        audit.rows.find((e) => e.action === "registration_staff_remove")
          ?.details,
      ).toMatchObject({ registrationSource: "staff", attempt: 1 });
    });
    it("commits one parallel reapplication and rejects retry tokens, forged users and wrong-edition reuse", async () => {
      const old = await withdrawn();
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          submitRegistration(player, edition.slug, reapply(old)),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db().select().from(registrationAttempts)).toHaveLength(1);
      await expect(
        submitRegistration(other, edition.slug, reapply(old)),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        submitRegistration(player, "other-test-cup", reapply(old)),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        submitRegistration(player, edition.slug, {
          ...reapply(old),
          userId: other.osuId,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(await ownRegistrations(other.osuId)).toEqual([]);
    });
    it("serializes a staff restoration race without silently replacing either attempt", async () => {
      const initial = await submitRegistration(player, edition.slug, input);
      const removed = await changeRegistrationParticipation(
        admin,
        edition.slug,
        initial.id,
        "remove",
        confirm(initial),
      );
      const outcomes = await Promise.allSettled([
        submitRegistration(
          player,
          edition.slug,
          reapply({ ...removed, attempt: 1 }),
        ),
        changeRegistrationParticipation(
          admin,
          edition.slug,
          initial.id,
          "restore",
          confirm(removed),
        ),
      ]);
      expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await ownRegistrations(player.osuId))[0].status).toBe("pending");
    });
    it.each(["pending", "accepted", "rejected"] as const)(
      "does not permit reapplication from %s",
      async (status) => {
        const old = await submitRegistration(player, edition.slug, input);
        await db()
          .update(registrations)
          .set({ status })
          .where(eq(registrations.id, old.id));
        await expect(
          submitRegistration(player, edition.slug, reapply(old)),
        ).rejects.toMatchObject({ status: 409 });
        expect(await db().select().from(registrationAttempts)).toEqual([]);
      },
    );
    it("blocks closed/paused registration, missing privacy, stale configuration and protected captain references without archiving", async () => {
      const old = await withdrawn();
      const current = (await readTournament(edition.slug))!;
      let updated = await tournamentCommand(admin, edition.slug, {
        action: "registration",
        expectedRevision: 0,
        confirmed: true,
        registration: { ...current.edition.registration, enabled: false },
      });
      await expect(
        submitRegistration(
          player,
          edition.slug,
          reapply(old, { configurationVersion: updated.revision }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      updated = await tournamentCommand(admin, edition.slug, {
        action: "registration",
        expectedRevision: updated.revision,
        confirmed: true,
        registration: current.edition.registration,
      });
      await expect(
        submitRegistration(player, edition.slug, reapply(old)),
      ).rejects.toMatchObject({ status: 409 });
      await db().insert(captains).values({
        editionSlug: edition.slug,
        userId: player.osuId,
        position: 1,
      });
      await expect(
        submitRegistration(
          player,
          edition.slug,
          reapply(old, { configurationVersion: updated.revision }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "");
      await expect(
        submitRegistration(
          player,
          edition.slug,
          reapply(old, { configurationVersion: updated.revision }),
        ),
      ).rejects.toMatchObject({ status: 503 });
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(admin.osuId));
      expect(await db().select().from(registrationAttempts)).toEqual([]);
    });
  },
);
