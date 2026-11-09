import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql, isNull, and } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  editionState,
  registrations,
  editionRevisions,
  editionEvents,
  draftPicks,
  staffRoles,
  teams,
  users,
  tournamentStages,
  tournamentRounds,
  fixtures,
  matchResults,
} from "../../src/db/schema";
import { prepareDraft } from "../fixtures/draft";
import { draftCommand, pickPlayer } from "../../src/lib/draft";
import { staffDraft, publicDraft } from "../../src/lib/draft-reads";
import { updateTeams, staffTeams } from "../../src/lib/teams";
import { updateCaptains } from "../../src/lib/captains";
import { readTournament } from "../../src/lib/tournament-reads";
import { tournamentCommand } from "../../src/lib/tournaments";
import { registrationAvailability } from "../../src/lib/registration-reads";
import {
  submitRegistration,
  withdrawRegistration,
} from "../../src/lib/registrations";
import { playerApplications } from "../../src/lib/dashboard";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL,
  slug = "recovery-104-test";
describe.skipIf(!url)(
  "Admin setup unlock and explicit rehearsal recovery",
  () => {
    let f: Awaited<ReturnType<typeof prepareDraft>>;
    beforeAll(() => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", "110001");
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "110001");
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
      f = await prepareDraft(slug, 110001, 4);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    const state = () => staffDraft(f.staff, slug);
    async function action(action: string, actor = f.staff) {
      const data = await state();
      return draftCommand(actor, slug, {
        command: {
          action,
          ...(["unlock", "reset"].includes(action)
            ? { expectedSetupVersion: data.edition!.setupVersion }
            : {}),
        },
        expectedVersion: data.session!.version,
        confirmed: true,
      });
    }
    async function pick(playerId = f.players[0].osuId) {
      const data = await state(),
        s = data.session!;
      return pickPlayer(f.staff, slug, {
        sessionId: s.id,
        turnIndex: s.turnIndex,
        candidateId: playerId,
        expectedVersion: s.version,
        idempotencyKey: randomUUID(),
      });
    }
    async function edit(command: Record<string, unknown>) {
      const row = (await readTournament(slug))!;
      return tournamentCommand(f.staff, slug, {
        ...command,
        expectedRevision: row.revision,
        confirmed: true,
      });
    }
    it("edits all tournament settings after Start while preserving prior acknowledgments and the enrollment pause", async () => {
      await db().update(registrations).set({ configurationVersion: 0 });
      const old = await db().select().from(registrations);
      const configuration = (await readTournament(slug))!;
      await edit({
        action: "schedule",
        schedule: [{ label: "Revised synthetic milestone", at: null }],
      });
      await edit({
        action: "rules",
        rules: configuration.edition.rules,
        eligibility: "Revised synthetic disclosure",
        automaticEligibility: {
          minPp: 100,
          maxPp: null,
          minRank: null,
          maxRank: 500000,
        },
      });
      await edit({
        action: "registration",
        registration: {
          ...configuration.edition.registration,
          questions: [
            {
              id: "new",
              label: "New question",
              maxLength: 100,
              required: false,
            },
          ],
        },
      });
      expect(await db().select().from(registrations)).toEqual(old);
      expect(
        (await db().select().from(editionRevisions)).filter(
          (r) => r.editionSlug === slug,
        ),
      ).toHaveLength(4);
      const latest = (await readTournament(slug))!;
      expect(latest.registrationPaused).toBe(true);
      expect(await registrationAvailability(latest.edition)).toBe("closed");
      expect(latest.edition.registration!.enabled).toBe(true);
      expect((await state()).session!.state).toBe("live");
    });
    it("unlocks pre-pick setup without losing order or reopening registration, then permits separate explicit enrollment resume within the window", async () => {
      const initial = await state(),
        before = (await readTournament(slug))!;
      const unlocked = await action("unlock");
      expect(unlocked.session!.state).toBe("setup");
      expect(unlocked.session!.turnSequence).toEqual(
        initial.session!.turnSequence,
      );
      expect(unlocked.edition!.lockedAt).toBeNull();
      expect(unlocked.edition!.registrationPausedAt).toEqual(
        initial.edition!.registrationPausedAt,
      );
      expect((await readTournament(slug))!.edition.registration).toEqual(
        before.edition.registration,
      );
      const data = await staffTeams(f.staff, slug),
        team = data.teams[0];
      await updateTeams(f.staff, slug, {
        command: {
          action: "edit",
          teamId: team.id,
          name: "Corrected team",
          capacity: 4,
          avatarKey: null,
        },
        expectedVersion: data.version,
        confirmed: true,
      });
      expect(await registrationAvailability(before.edition)).toBe("closed");
      const newcomer = { osuId: 110900, username: "Synthetic new applicant" };
      await db().insert(users).values(newcomer);
      await expect(
        submitRegistration(newcomer, slug, {
          configurationVersion: before.revision,
          rulesVersion: before.edition.rules!.version,
          rulesAcknowledged: true,
          eligibilityAcknowledged: true,
          answers: {},
        }),
      ).rejects.toMatchObject({ status: 409 });
      const unassigned = (
        await db()
          .select()
          .from(registrations)
          .where(
            and(
              eq(registrations.editionSlug, slug),
              eq(registrations.userId, f.players[7].osuId),
            ),
          )
      )[0];
      await expect(
        withdrawRegistration(f.players[7], unassigned.id, { confirmed: true }),
      ).rejects.toMatchObject({ status: 409 });
      await edit({ action: "enrollment", paused: false });
      const resumed = (await readTournament(slug))!;
      expect(await registrationAvailability(resumed.edition)).toBe("open");
      expect(
        (
          await submitRegistration(newcomer, slug, {
            configurationVersion: resumed.revision,
            rulesVersion: resumed.edition.rules!.version,
            rulesAcknowledged: true,
            eligibilityAcknowledged: true,
            answers: {},
          })
        ).status,
      ).toBe("pending");
      await edit({
        action: "registration",
        registration: { ...resumed.edition.registration, enabled: false },
      });
      expect(
        await registrationAvailability((await readTournament(slug))!.edition),
      ).toBe("paused");
      await action("start");
      expect((await state()).session!.state).toBe("live");
      expect((await state()).session!.turnSequence).toEqual(
        initial.session!.turnSequence,
      );
    });
    it("pauses atomically, preserves picks, allows safe capacity and future-turn edits, and resumes through the same authoritative pick command", async () => {
      await pick();
      const oldPicks = await db().select().from(draftPicks);
      const unlocked = await action("unlock");
      expect(unlocked.session!.state).toBe("paused");
      expect(await db().select().from(draftPicks)).toEqual(oldPicks);
      await expect(pick(f.players[1].osuId)).rejects.toMatchObject({
        status: 409,
      });
      const teamData = await staffTeams(f.staff, slug),
        team = teamData.teams.find((t) =>
          t.members.some((m) => m.osuId === f.players[0].osuId),
        )!;
      await expect(
        updateTeams(f.staff, slug, {
          command: {
            action: "edit",
            teamId: team.id,
            name: team.name,
            capacity: 1,
            avatarKey: null,
          },
          expectedVersion: teamData.version,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await updateTeams(f.staff, slug, {
        command: {
          action: "edit",
          teamId: team.id,
          name: "Live correction",
          capacity: 4,
          avatarKey: null,
        },
        expectedVersion: teamData.version,
        confirmed: true,
      });
      expect((await publicDraft(slug))!.picks[0].team.name).toBe(
        "Live correction",
      );
      let data = await state();
      const base = { expectedVersion: data.session!.version, confirmed: true };
      await expect(
        draftCommand(f.staff, slug, {
          ...base,
          command: {
            action: "configure",
            expectedSetupVersion: data.edition!.setupVersion,
            turnSequence: [...data.session!.turnSequence].reverse(),
          },
        }),
      ).rejects.toMatchObject({ status: 409 });
      const order = [...data.session!.turnSequence];
      order[1] = order[0];
      await draftCommand(f.staff, slug, {
        ...base,
        command: {
          action: "configure",
          expectedSetupVersion: data.edition!.setupVersion,
          turnSequence: order,
        },
      });
      data = await state();
      await expect(
        updateCaptains(f.staff, slug, {
          command: { action: "revoke", userId: f.a.osuId },
          expectedVersion: data.edition!.setupVersion,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        updateCaptains(f.staff, slug, {
          command: {
            action: "availability",
            userId: f.players[0].osuId,
            available: false,
            unavailableExplanation: "Synthetic",
          },
          expectedVersion: data.edition!.setupVersion,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await action("resume");
      await pick(f.players[1].osuId);
      expect((await publicDraft(slug))!.picks.map((p) => p.team.id)).toEqual(
        order.slice(0, 2),
      );
      expect(
        await db().select().from(draftPicks).where(isNull(draftPicks.voidedAt)),
      ).toHaveLength(2);
    });
    it("explicitly resets only rehearsal picks, retaining order, identities, history and registration pause for restart", async () => {
      await pick();
      await expect(action("reset")).rejects.toMatchObject({ status: 409 });
      const paused = await action("unlock");
      const configuration = (await readTournament(slug))!.edition;
      const reset = await action("reset");
      expect(reset.session).toMatchObject({
        state: "setup",
        turnIndex: 0,
        turnSequence: paused.session!.turnSequence,
        publicSnapshot: null,
        captainSnapshot: null,
      });
      expect(reset.picks).toHaveLength(1);
      expect(reset.picks[0].voidedAt).not.toBeNull();
      expect(
        reset.members.every((m) => m.membership.origin === "captain"),
      ).toBe(true);
      expect(reset.edition!.registrationPausedAt).toEqual(
        paused.edition!.registrationPausedAt,
      );
      expect((await readTournament(slug))!.edition).toEqual(configuration);
      expect(await publicDraft(slug)).toBeNull();
      expect(
        (await db().select().from(editionEvents)).some(
          (e) => e.kind === "draft_reset",
        ),
      ).toBe(true);
      await action("start");
      await pick();
      expect((await state()).picks).toHaveLength(2);
      expect((await state()).picks.filter((p) => !p.voidedAt)).toHaveLength(1);
    });
    it("enforces real Admin scope, stale edits, concurrent unlocks and transactional audit rollback", async () => {
      await db().insert(editionState).values({ slug: "other-104-test" });
      await db()
        .insert(staffRoles)
        .values([
          {
            userId: f.a.osuId,
            role: "mappooler",
            editionSlug: slug,
            grantedBy: f.staff.osuId,
          },
          {
            userId: f.b.osuId,
            role: "referee",
            editionSlug: slug,
            grantedBy: f.staff.osuId,
          },
          {
            userId: f.players[6].osuId,
            role: "admin",
            editionSlug: "other-104-test",
            grantedBy: f.staff.osuId,
          },
        ]);
      for (const actor of [f.a, f.b, f.players[0], f.players[6]])
        await expect(action("unlock", actor)).rejects.toMatchObject({
          status: 403,
        });
      const data = await state();
      const command = {
        command: {
          action: "unlock",
          expectedSetupVersion: data.edition!.setupVersion,
        },
        expectedVersion: data.session!.version,
        confirmed: true,
      };
      const attempts = await Promise.allSettled([
        draftCommand(f.staff, slug, command),
        draftCommand(f.staff, slug, command),
      ]);
      expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(attempts.find((x) => x.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      await action("start");
      const before = await state();
      await db().execute(
        sql`CREATE FUNCTION test_reject_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='draft_unlock' THEN RAISE EXCEPTION 'Synthetic'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_reject_recovery_audit BEFORE INSERT ON edition_events FOR EACH ROW EXECUTE FUNCTION test_reject_recovery_audit()`,
      );
      try {
        await expect(action("unlock")).rejects.toThrow();
        expect((await state()).session).toEqual(before.session);
        expect((await state()).edition).toEqual(before.edition);
      } finally {
        await db().execute(
          sql`DROP TRIGGER test_reject_recovery_audit ON edition_events; DROP FUNCTION test_reject_recovery_audit()`,
        );
      }
    });
    it("refuses unlock/reset for finalized teams or existing result evidence without changing history", async () => {
      await db()
        .update(teams)
        .set({ finalizedAt: new Date() })
        .where(eq(teams.id, f.teamRows[0].id));
      await expect(action("unlock")).rejects.toMatchObject({ status: 409 });
      await expect(action("reset")).rejects.toMatchObject({ status: 409 });
      await db().update(teams).set({ finalizedAt: null });
      const [stage] = await db()
        .insert(tournamentStages)
        .values({ editionSlug: slug, kind: "group" })
        .returning();
      const [round] = await db()
        .insert(tournamentRounds)
        .values({
          editionSlug: slug,
          stageId: stage.id,
          name: "Evidence",
          position: 1,
        })
        .returning();
      const [fixture] = await db()
        .insert(fixtures)
        .values({
          editionSlug: slug,
          roundId: round.id,
          label: "Existing evidence",
          homeTeamId: f.teamRows[0].id,
          awayTeamId: f.teamRows[1].id,
          timeZone: "UTC",
          position: 1,
        })
        .returning();
      await db().insert(matchResults).values({ fixtureId: fixture.id });
      await expect(action("unlock")).rejects.toMatchObject({ status: 409 });
      expect(await db().select().from(matchResults)).toHaveLength(1);
    });

    it("unlocks explicit pre-pick locks and Ready without discarding the saved order", async () => {
      const original = await state();
      await action("unlock");
      let data = await state();
      await updateCaptains(f.staff, slug, {
        command: { action: "lock" },
        expectedVersion: data.edition!.setupVersion,
        confirmed: true,
      });
      expect((await state()).edition!.lockedAt).not.toBeNull();
      data = await action("unlock");
      expect(data.session!.state).toBe("setup");
      expect(data.session!.turnSequence).toEqual(
        original.session!.turnSequence,
      );
      await action("ready");
      expect((await state()).session!.state).toBe("ready");
      data = await action("unlock");
      expect(data.session!.state).toBe("setup");
      expect(data.session!.turnSequence).toEqual(
        original.session!.turnSequence,
      );
      expect(data.edition!.registrationPausedAt).toEqual(
        original.edition!.registrationPausedAt,
      );
    });
    it("allows an unfinalized completed draft to add future turns, then protects actual finalized history", async () => {
      for (const player of f.players.slice(0, 4)) await pick(player.osuId);
      const complete = await state();
      expect(complete.session!.state).toBe("completed");
      const paused = await action("unlock");
      expect(paused.session!.state).toBe("paused");
      await draftCommand(f.staff, slug, {
        command: {
          action: "configure",
          expectedSetupVersion: paused.edition!.setupVersion,
          turnSequence: [
            ...paused.session!.turnSequence,
            paused.session!.turnSequence[0],
          ],
        },
        expectedVersion: paused.session!.version,
        confirmed: true,
      });
      await action("resume");
      await pick(f.players[4].osuId);
      const final = await action("finalize");
      expect(final.session!.state).toBe("finalized");
      expect(final.picks.slice(0, 4).map((p) => p.id)).toEqual(
        complete.picks.map((p) => p.id),
      );
      await expect(action("unlock")).rejects.toMatchObject({ status: 409 });
      await expect(action("reset")).rejects.toMatchObject({ status: 409 });
      expect((await state()).session).toEqual(final.session);
    });

    it("serializes a live captain pick against Pause and edit with one winner", async () => {
      const data = await state(),
        session = data.session!;
      const attempts = await Promise.allSettled([
        draftCommand(f.staff, slug, {
          command: {
            action: "unlock",
            expectedSetupVersion: data.edition!.setupVersion,
          },
          expectedVersion: session.version,
          confirmed: true,
        }),
        pickPlayer(f.a, slug, {
          sessionId: session.id,
          turnIndex: session.turnIndex,
          candidateId: f.players[0].osuId,
          expectedVersion: session.version,
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(attempts.find((x) => x.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      const after = await state();
      expect(
        after.session!.state === "setup"
          ? after.picks.length === 0
          : after.picks.length === 1 && after.session!.state === "live",
      ).toBe(true);
      expect(
        (await db().select().from(editionEvents)).filter((e) =>
          ["draft_unlock", "draft_pick"].includes(e.kind),
        ),
      ).toHaveLength(1);
      expect(after.edition!.registrationPausedAt).not.toBeNull();
    });

    it("keeps assigned-player withdrawal unavailable even after an explicit enrollment resume", async () => {
      await pick();
      await action("unlock");
      await edit({ action: "enrollment", paused: false });
      expect(
        (await playerApplications(f.players[0].osuId))[0].withdrawable,
      ).toBe(false);
      expect(
        (await playerApplications(f.players[7].osuId))[0].withdrawable,
      ).toBe(true);
    });
  },
);
