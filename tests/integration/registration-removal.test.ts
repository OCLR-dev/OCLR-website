import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, closeDb } from "../../src/db";
import {
  badgeReviews,
  captains,
  draftPicks,
  editionState,
  fixtures,
  memberships,
  registrationEvents,
  registrations,
  staffRoles,
  teams,
  tournamentRounds,
  tournamentStages,
  users,
} from "../../src/db/schema";
import {
  applicationDetails,
  changeRegistrationParticipation,
  listApplications,
  reviewApplication,
} from "../../src/lib/staff";
import {
  ownRegistrations,
  withdrawRegistration,
} from "../../src/lib/registrations";
import { playerApplications } from "../../src/lib/dashboard";
import { publicPlayers } from "../../src/lib/players";
import { auditLog } from "../../src/lib/audit";
import { updateCaptains } from "../../src/lib/captains";
import { pickPlayer, staffDraft } from "../../src/lib/draft";
import { prepareDraft } from "../fixtures/draft";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { POST as reviewRegistrationRoute } from "../../src/app/api/admin/registrations/[id]/review/route";
import { POST as removeRegistrationRoute } from "../../src/app/api/admin/tournaments/[edition]/registrations/[id]/remove/route";
import { POST as restoreRegistrationRoute } from "../../src/app/api/admin/tournaments/[edition]/registrations/[id]/restore/route";
import {
  removeRegistrationWrite,
  restoreRegistrationWrite,
  reviewRegistrationWrite,
} from "../../src/lib/registration-write-contract";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 610001, username: "Synthetic Removal Admin" };
const player = { osuId: 610002, username: "Synthetic Removal Player" };
const scoped = { osuId: 610003, username: "Synthetic Scoped Admin" };
const mapper = { osuId: 610004, username: "Synthetic Mappooler" };
const referee = { osuId: 610005, username: "Synthetic Referee" };
const other = "other-removal-test";
const origin = "https://oclr.example.test";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => admin,
}));
const payload = (r: { updatedAt: Date }) => ({
  confirmed: true,
  expectedUpdatedAt: r.updatedAt.toISOString(),
});
describe.skipIf(!url)(
  "administrative registration removal and explicit restoration",
  () => {
    beforeAll(() => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("APP_URL", origin);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(admin.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      await seedEditions([edition, { ...edition, slug: other }]);
      await db().insert(users).values([admin, player, scoped, mapper, referee]);
      await db()
        .insert(staffRoles)
        .values([
          {
            userId: scoped.osuId,
            role: "admin",
            editionSlug: edition.slug,
            grantedBy: admin.osuId,
          },
          {
            userId: mapper.osuId,
            role: "mappooler",
            editionSlug: edition.slug,
            grantedBy: admin.osuId,
          },
          {
            userId: referee.osuId,
            role: "referee",
            editionSlug: edition.slug,
            grantedBy: admin.osuId,
          },
        ]);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    async function registration(
      status: "pending" | "accepted" | "rejected" | "withdrawn" = "pending",
      source: "staff" | "player" = "player",
      slug = edition.slug,
      userId = player.osuId,
    ) {
      const [r] = await db()
        .insert(registrations)
        .values({
          editionSlug: slug,
          userId,
          status,
          source,
          answers: source === "staff" ? {} : { private: "PRIVATE_ANSWER" },
          rulesVersion: source === "staff" ? null : "original-test-v1",
          statusReason:
            status === "rejected" ? "Original review explanation" : null,
        })
        .returning();
      await db()
        .insert(registrationEvents)
        .values({ registrationId: r.id, actorId: userId, toStatus: status });
      return r;
    }
    it.each(["pending", "accepted", "rejected"] as const)(
      "withdraws %s without deleting identity, consent, answers or review history",
      async (status) => {
        const r = await registration(status);
        const separate = await registration("accepted", "player", other);
        await db().insert(badgeReviews).values({
          editionSlug: edition.slug,
          userId: player.osuId,
          mode: "osu",
          fingerprint: "synthetic",
          classifications: [],
          reviewedBy: admin.osuId,
        });
        expect(
          await changeRegistrationParticipation(
            scoped,
            edition.slug,
            r.id,
            "remove",
            payload(r),
          ),
        ).toMatchObject({ id: r.id, status: "withdrawn" });
        const details = await applicationDetails(admin, r.id);
        expect(details.lastOperation).toBe("staff_remove");
        expect(details.registration).toMatchObject({
          ...r,
          status: "withdrawn",
          updatedAt: expect.any(Date),
        });
        expect(
          await db().select().from(users).where(eq(users.osuId, player.osuId)),
        ).toHaveLength(1);
        expect(await db().select().from(badgeReviews)).toHaveLength(1);
        expect(
          (await applicationDetails(admin, separate.id)).registration,
        ).toEqual(separate);
        expect(
          (await listApplications(admin, { edition: edition.slug })).total,
        ).toBe(0);
        expect(
          (
            await listApplications(admin, {
              edition: edition.slug,
              status: "withdrawn",
            })
          ).total,
        ).toBe(1);
        expect(
          (await listApplications(admin, { edition: edition.slug, status: "" }))
            .total,
        ).toBe(1);
        expect(
          (await publicPlayers({ edition: edition.slug })).rows,
        ).toHaveLength(0);
        expect(
          (await publicPlayers({ edition: other })).rows.map((p) => p.osuId),
        ).toEqual([player.osuId]);
        expect(
          (await playerApplications(player.osuId)).find(
            (p) => p.registration.id === r.id,
          ),
        ).toMatchObject({ lastOperation: "staff_remove", withdrawable: false });
        expect(
          (await ownRegistrations(player.osuId)).find((p) => p.id === r.id)
            ?.lastOperation,
        ).toBe("staff_remove");
        const audit = await auditLog(admin, {
          action: "registration_staff_remove",
        });
        expect(audit.rows).toHaveLength(1);
        expect(audit.rows[0]).toMatchObject({
          actorId: scoped.osuId,
          edition: edition.slug,
          entityId: r.id,
          before: { status },
          after: { status: "withdrawn" },
        });
        expect(JSON.stringify(audit)).not.toContain("PRIVATE_ANSWER");
        const events = await db()
          .select()
          .from(registrationEvents)
          .where(eq(registrationEvents.registrationId, r.id));
        expect(events).toHaveLength(2);
        expect(
          events.find((e) => e.operation === "staff_remove"),
        ).toMatchObject({
          actorId: scoped.osuId,
          createdAt: details.registration.updatedAt,
        });
      },
    );
    it.each(["staff", "player"] as const)(
      "restores %s entries only to Pending, preserving original acknowledgments",
      async (source) => {
        const r = await registration("accepted", source);
        const change = (
          route: typeof removeRegistrationRoute,
          path: string,
          expectedUpdatedAt: string,
        ) =>
          route(
            new Request(
              origin +
                path.replace("{edition}", edition.slug).replace("{id}", r.id),
              {
                method: "POST",
                headers: { origin, "content-type": "application/json" },
                body: JSON.stringify({ expectedUpdatedAt, confirmed: true }),
              },
            ),
            { params: Promise.resolve({ edition: edition.slug, id: r.id }) },
          );
        const removal = await change(
          removeRegistrationRoute,
          removeRegistrationWrite.path,
          r.updatedAt.toISOString(),
        );
        expect(removal.status).toBe(200);
        const removed = await removal.json();
        expect(removeRegistrationWrite.response.parse(removed)).toEqual(
          removed,
        );
        expect(removed).toMatchObject({ id: r.id, status: "withdrawn" });
        const restoration = await change(
          restoreRegistrationRoute,
          restoreRegistrationWrite.path,
          removed.updatedAt,
        );
        expect(restoration.status).toBe(200);
        const restored = await restoration.json();
        expect(restoreRegistrationWrite.response.parse(restored)).toEqual(
          restored,
        );
        expect(restored).toMatchObject({ id: r.id, status: "pending" });
        const current = await applicationDetails(admin, r.id);
        expect(current.lastOperation).toBe("staff_restore");
        expect(current.registration).toMatchObject({
          status: "pending",
          source,
          answers: r.answers,
          rulesVersion: r.rulesVersion,
          eligibilityAcknowledged: r.eligibilityAcknowledged,
          configurationVersion: r.configurationVersion,
        });
        expect(
          (await publicPlayers({ edition: edition.slug })).rows,
        ).toHaveLength(0);
        await expect(
          changeRegistrationParticipation(
            admin,
            edition.slug,
            r.id,
            "restore",
            payload(current.registration),
          ),
        ).rejects.toMatchObject({ status: 409 });
        expect(
          (await auditLog(admin, { action: "registration_staff_restore" }))
            .rows,
        ).toHaveLength(1);
      },
    );
    it("does not fabricate provenance for historic or self-withdrawn entries, including an Admin's own withdrawal", async () => {
      const legacy = await registration("withdrawn");
      expect(
        (await applicationDetails(admin, legacy.id)).lastOperation,
      ).toBeNull();
      await expect(
        changeRegistrationParticipation(
          admin,
          edition.slug,
          legacy.id,
          "restore",
          payload(legacy),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const own = await registration(
        "pending",
        "player",
        edition.slug,
        admin.osuId,
      );
      const removed = await changeRegistrationParticipation(
        admin,
        edition.slug,
        own.id,
        "remove",
        payload(own),
      );
      expect((await applicationDetails(admin, own.id)).lastOperation).toBe(
        "staff_remove",
      );
      await changeRegistrationParticipation(
        admin,
        edition.slug,
        own.id,
        "restore",
        payload(removed),
      );
      await withdrawRegistration(admin, own.id, { confirmed: true });
      const current = await applicationDetails(admin, own.id);
      expect(current.lastOperation).toBe("player_withdraw");
      await expect(
        changeRegistrationParticipation(
          admin,
          edition.slug,
          own.id,
          "restore",
          payload(current.registration),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("rejects malformed/forged requests, wrong editions, unauthorized and revoked roles", async () => {
      const r = await registration();
      for (const actor of [player, mapper, referee])
        await expect(
          changeRegistrationParticipation(
            actor,
            edition.slug,
            r.id,
            "remove",
            payload(r),
          ),
        ).rejects.toMatchObject({ status: 403 });
      await expect(
        changeRegistrationParticipation(
          scoped,
          other,
          r.id,
          "remove",
          payload(r),
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        changeRegistrationParticipation(
          admin,
          other,
          r.id,
          "remove",
          payload(r),
        ),
      ).rejects.toMatchObject({ status: 404 });
      for (const input of [
        { ...payload(r), actorId: admin.osuId },
        { ...payload(r), confirmed: false },
        { expectedUpdatedAt: "invalid", confirmed: true },
      ])
        await expect(
          changeRegistrationParticipation(
            admin,
            edition.slug,
            r.id,
            "remove",
            input,
          ),
        ).rejects.toMatchObject({ status: 400 });
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, scoped.osuId));
      await expect(
        changeRegistrationParticipation(
          scoped,
          edition.slug,
          r.id,
          "remove",
          payload(r),
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(await db().select().from(registrationEvents)).toHaveLength(1);
    });
    it("returns the existing review payload and rejects invalid or stale decisions", async () => {
      const r = await registration();
      const review = (reason: string) =>
        reviewRegistrationRoute(
          new Request(
            origin + reviewRegistrationWrite.path.replace("{id}", r.id),
            {
              method: "POST",
              headers: { origin, "content-type": "application/json" },
              body: JSON.stringify({
                ...payload(r),
                status: "rejected",
                reason,
              }),
            },
          ),
          { params: Promise.resolve({ id: r.id }) },
        );
      expect((await review("")).status).toBe(400);
      const response = await review("  Synthetic review reason  ");
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(reviewRegistrationWrite.response.parse(body)).toEqual(body);
      expect(body).toMatchObject({
        id: r.id,
        answers: r.answers,
        status: "rejected",
        statusReason: "Synthetic review reason",
        createdAt: r.createdAt.toISOString(),
        updatedAt: expect.any(String),
      });
      expect((await review("stale")).status).toBe(409);
      expect(await db().select().from(registrationEvents)).toHaveLength(2);
    });
    it("serializes duplicate removes and remove/review races without false success events", async () => {
      const r = await registration();
      const outcomes = await Promise.allSettled([
        changeRegistrationParticipation(
          admin,
          edition.slug,
          r.id,
          "remove",
          payload(r),
        ),
        reviewApplication(admin, r.id, { ...payload(r), status: "accepted" }),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect(await db().select().from(registrationEvents)).toHaveLength(2);
      const fresh = (await applicationDetails(admin, r.id)).registration;
      if (fresh.status !== "withdrawn")
        await changeRegistrationParticipation(
          admin,
          edition.slug,
          r.id,
          "remove",
          payload(fresh),
        );
      const count = (await db().select().from(registrationEvents)).length;
      await expect(
        changeRegistrationParticipation(
          admin,
          edition.slug,
          r.id,
          "remove",
          payload(r),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const removed = (await applicationDetails(admin, r.id)).registration;
      await expect(
        changeRegistrationParticipation(
          admin,
          edition.slug,
          r.id,
          "remove",
          payload(removed),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await db().select().from(registrationEvents)).toHaveLength(count);
      const another = await registration(
        "pending",
        "player",
        edition.slug,
        mapper.osuId,
      );
      const duplicates = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          changeRegistrationParticipation(
            admin,
            edition.slug,
            another.id,
            "remove",
            payload(another),
          ),
        ),
      );
      expect(duplicates.filter((o) => o.status === "fulfilled")).toHaveLength(
        1,
      );
    });
    it("rolls the transition back if its automatic audit insert fails", async () => {
      const r = await registration();
      await db().execute(
        sql`CREATE FUNCTION test_removal_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`,
      );
      await db().execute(
        sql`CREATE TRIGGER test_removal_audit BEFORE INSERT ON registration_events FOR EACH ROW EXECUTE FUNCTION test_removal_audit_fail()`,
      );
      try {
        await expect(
          changeRegistrationParticipation(
            admin,
            edition.slug,
            r.id,
            "remove",
            payload(r),
          ),
        ).rejects.toThrow();
        expect((await applicationDetails(admin, r.id)).registration).toEqual(r);
        expect(await db().select().from(registrationEvents)).toHaveLength(1);
      } finally {
        await db().execute(
          sql`DROP TRIGGER test_removal_audit ON registration_events; DROP FUNCTION test_removal_audit_fail()`,
        );
      }
    });
    it("serializes captain appointment/removal and never leaves an appointed withdrawn applicant", async () => {
      const r = await registration("accepted");
      const outcomes = await Promise.allSettled([
        changeRegistrationParticipation(
          admin,
          edition.slug,
          r.id,
          "remove",
          payload(r),
        ),
        updateCaptains(admin, edition.slug, {
          command: { action: "appoint", userId: player.osuId },
          expectedVersion: 0,
          confirmed: true,
        }),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      const appointed = await db().select().from(captains);
      if (appointed.length)
        expect(
          (await applicationDetails(admin, r.id)).registration.status,
        ).toBe("accepted");
      else
        expect(
          (await applicationDetails(admin, r.id)).registration.status,
        ).toBe("withdrawn");
    });
    it("protects captains, assigned players and persisted pool members during concurrent live picks", async () => {
      const f = await prepareDraft("protected-removal-test", admin.osuId);
      const records = await db()
        .select()
        .from(registrations)
        .where(eq(registrations.editionSlug, "protected-removal-test"));
      const captain = records.find((r) => r.userId === f.a.osuId)!;
      await expect(
        changeRegistrationParticipation(
          admin,
          captain.editionSlug,
          captain.id,
          "remove",
          payload(captain),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const r = records.find((r) => r.userId === f.players[0].osuId)!;
      const session = (await staffDraft(f.staff, r.editionSlug)).session!;
      const outcomes = await Promise.allSettled([
        changeRegistrationParticipation(
          admin,
          r.editionSlug,
          r.id,
          "remove",
          payload(r),
        ),
        pickPlayer(f.staff, r.editionSlug, {
          sessionId: session.id,
          expectedVersion: session.version,
          turnIndex: session.turnIndex,
          candidateId: r.userId,
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect((await applicationDetails(admin, r.id)).registration.status).toBe(
        "accepted",
      );
      expect(await db().select().from(draftPicks)).toHaveLength(1);
      await expect(
        changeRegistrationParticipation(
          admin,
          r.editionSlug,
          r.id,
          "remove",
          payload(r),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const pending = await registration(
        "pending",
        "staff",
        r.editionSlug,
        referee.osuId,
      );
      expect(
        (
          await changeRegistrationParticipation(
            admin,
            r.editionSlug,
            pending.id,
            "remove",
            payload(pending),
          )
        ).status,
      ).toBe("withdrawn");
    });
    it("permits unreferenced corrections despite enrollment closure, but never restores a completed tournament", async () => {
      const r = await registration("accepted");
      await db()
        .update(editionState)
        .set({ lockedAt: new Date(), registrationPausedAt: new Date() })
        .where(eq(editionState.slug, edition.slug));
      const removed = await changeRegistrationParticipation(
        admin,
        edition.slug,
        r.id,
        "remove",
        payload(r),
      );
      await seedEditions([
        { ...edition, status: "completed" },
        { ...edition, slug: other },
      ]);
      await expect(
        changeRegistrationParticipation(
          admin,
          edition.slug,
          r.id,
          "restore",
          payload(removed),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("retains fixture-linked historical roster references even after the membership ends", async () => {
      const r = await registration("accepted");
      const [team] = await db()
        .insert(teams)
        .values({
          editionSlug: edition.slug,
          captainId: mapper.osuId,
          name: "Synthetic historical team",
        })
        .returning();
      await db().insert(memberships).values({
        editionSlug: edition.slug,
        teamId: team.id,
        userId: player.osuId,
        origin: "draft",
        leftAt: new Date(),
      });
      const [stage] = await db()
        .insert(tournamentStages)
        .values({ editionSlug: edition.slug, kind: "group" })
        .returning();
      const [round] = await db()
        .insert(tournamentRounds)
        .values({
          editionSlug: edition.slug,
          stageId: stage.id,
          name: "Synthetic round",
          position: 1,
        })
        .returning();
      await db().insert(fixtures).values({
        editionSlug: edition.slug,
        roundId: round.id,
        homeTeamId: team.id,
        label: "Historical fixture",
        timeZone: "UTC",
        position: 1,
      });
      await expect(
        changeRegistrationParticipation(
          admin,
          edition.slug,
          r.id,
          "remove",
          payload(r),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect((await applicationDetails(admin, r.id)).registration).toEqual(r);
    });
  },
);
