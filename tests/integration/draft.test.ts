let fixtureEditions: unknown[];
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
import { updateCaptains } from "../../src/lib/captains";
import { ownTeam } from "../../src/lib/teams";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { eq, isNull, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  draftPicks,
  editionEvents,
  draftSessions,
  memberships,
  teams,
} from "../../src/db/schema";
import { captainDraft, publicDraft, staffDraft } from "../../src/lib/draft-reads";
import { draftCommand, pickPlayer } from "../../src/lib/draft";
import { generateTurnSequence } from "../../src/lib/draft-order";
import { prepareDraft } from "../fixtures/draft";
import { edition } from "../fixtures/edition";
import { POST as draftRoute } from "../../src/app/api/admin/tournaments/[edition]/draft/route";
import { POST as pickRoute } from "../../src/app/api/tournaments/[edition]/draft/picks/route";
import {
  changeDraftWrite,
  pickPlayerWrite,
} from "../../src/lib/draft-setup-write-contracts";
import { extendedSchemas } from "../../src/lib/extended-read-resources";
import type { User } from "../../src/lib/auth/sessions";
const origin = "https://oclr.example.test";
let routeActor: User;
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => routeActor,
}));
function post(
  route: (...args: Parameters<typeof pickRoute>) => Promise<Response>,
  path: string,
  body: unknown,
  actor: User,
) {
  routeActor = actor;
  return route(
    new Request(origin + path.replace("{edition}", edition.slug), {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ edition: edition.slug }) },
  );
}
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  "authoritative two-mode draft transactions and publication",
  () => {
    let fixture: Awaited<ReturnType<typeof prepareDraft>>;
    beforeAll(() => {
      assertTestDatabase(url);
      fixtureEditions = [edition];
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("APP_URL", origin);
      vi.stubEnv("ADMIN_OSU_IDS", "100001");
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      await seedEditions(fixtureEditions);
      fixture = await prepareDraft(edition.slug, 100001);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    async function input(candidate = fixture.players[0].osuId) {
      const session = (await staffDraft(fixture.staff, edition.slug)).session!;
      return {
        sessionId: session.id,
        turnIndex: session.turnIndex,
        candidateId: candidate,
        expectedVersion: session.version,
        idempotencyKey: randomUUID(),
      };
    }
    async function command(action: string) {
      const session = (await staffDraft(fixture.staff, edition.slug)).session!;
      return draftCommand(fixture.staff, edition.slug, {
        command: { action },
        expectedVersion: session.version,

        confirmed: true,
      });
    }
    async function reopenSetup() {
      await command("pause");
      await command("abort");
      await command("recover");
      const state = await staffDraft(fixture.staff, edition.slug);
      await updateCaptains(fixture.staff, edition.slug, {
        command: { action: "lock" },
        expectedVersion: state.edition!.setupVersion,
        confirmed: true,
      });
      return staffDraft(fixture.staff, edition.slug);
    }
    it.each(["snake", "forward", "custom"] as const)(
      "rehearses a complete %s sequence using the same authoritative turns",
      async (strategy) => {
        const state = await reopenSetup();
        const ids = state.teams.map((t) => t.team.id);
        const sequence =
          strategy === "custom"
            ? [ids[1], ids[0], ids[0], ids[1], ids[0], ids[1]]
            : generateTurnSequence(ids, 3, strategy);
        await draftCommand(fixture.staff, edition.slug, {
          expectedVersion: state.session!.version,
          confirmed: true,
          command: {
            action: "configure",
            expectedSetupVersion: state.edition!.setupVersion,
            turnSequence: sequence,
          },
        });
        await command("ready");
        await command("start");
        await command("publish");
        for (let i = 0; i < sequence.length; i++) {
          const active = state.teams.find((t) => t.team.id === sequence[i])!;
          const actor =
            i % 2
              ? fixture.staff
              : { osuId: active.team.captainId, username: active.captainName };
          const result = await pickPlayer(
            actor,
            edition.slug,
            await input(fixture.players[i].osuId),
          );
          expect(result.teamId).toBe(sequence[i]);
          await command("publish");
        }
        const final = await staffDraft(fixture.staff, edition.slug);
        expect(final.session?.state).toBe("completed");
        expect(
          final.picks.filter((p) => !p.voidedAt).map((p) => p.teamId),
        ).toEqual(sequence);
        expect(
          (await publicDraft(edition.slug))?.picks.map((p) => p.team.id),
        ).toEqual(sequence);
        await expect(
          draftCommand(fixture.staff, edition.slug, {
            expectedVersion: final.session!.version,
            confirmed: true,
            command: {
              action: "configure",
              expectedSetupVersion: final.edition!.setupVersion,
              turnSequence: sequence,
            },
          }),
        ).rejects.toMatchObject({ status: 409 });
      },
    );
    it("rejects stale setup/draft revisions and invalid teams without successful audit events", async () => {
      const state = await reopenSetup();
      const sequence = state.teams.map((t) => t.team.id);
      const request = {
        expectedVersion: state.session!.version,
        confirmed: true,
        command: {
          action: "configure",
          expectedSetupVersion: state.edition!.setupVersion,
          turnSequence: sequence,
        },
      };
      const count = (await db().select().from(editionEvents)).length;
      for (const value of [
        { ...request, expectedVersion: request.expectedVersion - 1 },
        {
          ...request,
          command: {
            ...request.command,
            expectedSetupVersion: request.command.expectedSetupVersion - 1,
          },
        },
        {
          ...request,
          command: { ...request.command, turnSequence: [randomUUID()] },
        },
      ])
        await expect(
          draftCommand(fixture.staff, edition.slug, value),
        ).rejects.toMatchObject({ status: 409 });
      expect((await db().select().from(editionEvents)).length).toBe(count);
      expect(
        (await staffDraft(fixture.staff, edition.slug)).session?.version,
      ).toBe(request.expectedVersion);
    });
    it("allows only the active captain and records staff-on-behalf as the on-clock captain’s pick", async () => {
      const value = await input();
      await expect(
        pickPlayer(fixture.b, edition.slug, value),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        pickPlayer(fixture.players[1], edition.slug, value),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        draftCommand(fixture.a, edition.slug, {}),
      ).rejects.toMatchObject({ status: 403 });
      const first = await pickPlayer(fixture.a, edition.slug, value);
      await command("publish");
      const second = await pickPlayer(
        fixture.staff,
        edition.slug,
        await input(fixture.players[1].osuId),
      );
      const picks = await db().select().from(draftPicks);
      expect(picks[0]).toMatchObject({
        captainId: fixture.a.osuId,
        actorId: fixture.a.osuId,
        mode: "captain_direct",
        teamId: first.teamId,
      });
      expect(picks[1]).toMatchObject({
        captainId: fixture.b.osuId,
        actorId: fixture.staff.osuId,
        mode: "staff_on_behalf",
        teamId: second.teamId,
      });
      expect(
        (await staffDraft(fixture.staff, edition.slug)).session?.state,
      ).toBe("completed");
      expect(
        (
          await db()
            .select()
            .from(memberships)
            .where(isNull(memberships.leftAt))
        ).length,
      ).toBe(4);
    });
    it("commits exactly one competing captain/staff pick with matching roster and one turn advance", async () => {
      const value = await input();
      const results = await Promise.allSettled([
        pickPlayer(fixture.a, edition.slug, value),
        pickPlayer(fixture.staff, edition.slug, {
          ...value,
          candidateId: fixture.players[1].osuId,
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      const snapshot = await staffDraft(fixture.staff, edition.slug);
      expect(snapshot.session?.turnIndex).toBe(1);
      expect(snapshot.picks).toHaveLength(1);
      expect(
        snapshot.members.filter((m) => m.membership.origin === "draft"),
      ).toHaveLength(1);
    });
    it("allows only one active-captain pick when two independently authorized captains race for the same player", async () => {
      const value = await input();
      const results = await Promise.allSettled([
        pickPlayer(fixture.a, edition.slug, value),
        pickPlayer(fixture.b, edition.slug, {
          ...value,
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect(await db().select().from(draftPicks)).toHaveLength(1);
      expect(
        (await staffDraft(fixture.staff, edition.slug)).session?.turnIndex,
      ).toBe(1);
    });
    it("publishes actual roster capacities only in the authorized captain snapshot", async () => {
      await db()
        .update(teams)
        .set({ capacity: 4 })
        .where(eq(teams.id, fixture.sequence[0]));
      expect(
        (await captainDraft(fixture.a, edition.slug))?.capacities,
      ).not.toHaveProperty(fixture.sequence[0], 4);
      await command("publish");
      expect(
        (await captainDraft(fixture.b, edition.slug))?.capacities?.[
          fixture.sequence[0]
        ],
      ).toBe(4);
      expect(await publicDraft(edition.slug)).not.toHaveProperty("capacities");
    });
    it("enforces database active-turn/player uniqueness in addition to service locks", async () => {
      await pickPlayer(fixture.a, edition.slug, await input());
      const [row] = await db().select().from(draftPicks);
      await expect(
        db()
          .insert(draftPicks)
          .values({
            ...row,
            id: randomUUID(),
            actorId: fixture.staff.osuId,
            requestKey: randomUUID(),
          }),
      ).rejects.toThrow();
      await expect(
        db()
          .insert(draftPicks)
          .values({
            ...row,
            id: randomUUID(),
            turnIndex: 1,
            requestKey: randomUUID(),
          }),
      ).rejects.toThrow();
    });
    it("retries are idempotent for both callers and reject altered payloads with the same key", async () => {
      const a = await input();
      const pick = (value: typeof a) =>
        post(pickRoute, pickPlayerWrite.path, value, fixture.a);
      const response = await pick(a);
      expect(response.status).toBe(200);
      const body = await response.json();
      const savedA = pickPlayerWrite.response.parse(body);
      expect(savedA).toEqual(body);
      expect(savedA.publicVersion).toBe(
        (await publicDraft(edition.slug))!.version,
      );
      const retry = await pick(a);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(savedA);
      const conflict = await pick({
        ...a,
        candidateId: fixture.players[1].osuId,
      });
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toEqual({
        error: "An idempotency key cannot be reused for another request.",
      });
      const session = (await staffDraft(fixture.staff, edition.slug)).session!;
      const publication = await post(
        draftRoute,
        changeDraftWrite.path,
        {
          expectedVersion: session.version,
          confirmed: true,
          command: { action: "publish" },
        },
        fixture.staff,
      );
      expect(publication.status).toBe(200);
      const workspace = await publication.json();
      expect(
        extendedSchemas[changeDraftWrite.response.readResource].parse(
          workspace,
        ),
      ).toEqual(workspace);
      expect(workspace.picks).toContainEqual(
        expect.objectContaining({ id: savedA.pickId }),
      );
      const b = await input(fixture.players[1].osuId);
      const savedB = await pickPlayer(fixture.staff, edition.slug, b);
      expect(savedB.publicVersion).toBe(
        (await publicDraft(edition.slug))!.version,
      );
      expect(await pickPlayer(fixture.staff, edition.slug, b)).toEqual(savedB);
      await expect(
        pickPlayer(fixture.staff, edition.slug, {
          ...b,
          candidateId: fixture.players[2].osuId,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await db().select().from(draftPicks)).toHaveLength(2);
    });
    it("rolls back a pick and both snapshots on audit failure, then publishes the retried pick", async () => {
      const original = await publicDraft(edition.slug);
      const originalCaptain = await captainDraft(fixture.b, edition.slug);
      const originalStaff = await staffDraft(fixture.staff, edition.slug);
      const value = await input();
      await db().execute(sql`
        CREATE FUNCTION oclr_test_reject_draft_pick_audit() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.kind = 'draft_pick' THEN
            RAISE EXCEPTION 'Synthetic draft pick audit failure';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER oclr_test_reject_draft_pick_audit
          BEFORE INSERT ON edition_events FOR EACH ROW
          EXECUTE FUNCTION oclr_test_reject_draft_pick_audit()
      `);
      try {
        await expect(
          pickPlayer(fixture.staff, edition.slug, value),
        ).rejects.toThrow();
        expect(await staffDraft(fixture.staff, edition.slug)).toEqual(
          originalStaff,
        );
        expect(await captainDraft(fixture.b, edition.slug)).toEqual(
          originalCaptain,
        );
        expect(await publicDraft(edition.slug)).toEqual(original);
      } finally {
        await db().execute(sql`
          DROP TRIGGER oclr_test_reject_draft_pick_audit ON edition_events;
          DROP FUNCTION oclr_test_reject_draft_pick_audit()
        `);
      }
      await pickPlayer(fixture.staff, edition.slug, value);
      expect(
        await db()
          .select()
          .from(editionEvents)
          .where(eq(editionEvents.kind, "draft_pick")),
      ).toHaveLength(1);
      expect((await publicDraft(edition.slug))?.version).toBeGreaterThan(
        original!.version,
      );
      expect((await captainDraft(fixture.b, edition.slug))?.picks).toHaveLength(
        1,
      );
      const publicData = await publicDraft(edition.slug);
      expect(publicData?.picks).toHaveLength(1);
      expect(
        (await ownTeam(fixture.a.osuId, edition.slug))?.members,
      ).toHaveLength(2);
      expect(publicData?.picks[0].team.captain.osuId).toBe(fixture.a.osuId);
      expect(publicData?.pool).toBeNull();
      const text = JSON.stringify(publicData);
      for (const secret of [
        "actorId",
        "staff_on_behalf",
        "requestKey",
        "requestHash",
        "reason",
        "Synthetic Operator",
      ])
        expect(text).not.toContain(secret);
    });
    it("honors revoked pool visibility without exposing the last published candidate list", async () => {
      const setup = (await staffDraft(fixture.staff, edition.slug)).edition!;
      const change = (expectedVersion: number, poolPublished: boolean) =>
        updateCaptains(fixture.staff, edition.slug, {
          command: { action: "publish", published: true, poolPublished },
          expectedVersion,

          confirmed: true,
        });
      await change(setup.setupVersion, true);
      await command("publish");
      expect((await publicDraft(edition.slug))?.pool).toHaveLength(
        fixture.players.length,
      );
      await change(setup.setupVersion + 1, false);
      expect((await publicDraft(edition.slug))?.pool).toBeNull();
    });
    it("rejects paused, stale, unavailable, forged team/actor and cross-edition requests", async () => {
      const value = await input();
      await expect(
        pickPlayer(fixture.a, edition.slug, {
          ...value,
          captainId: fixture.b.osuId,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        pickPlayer(fixture.a, "unpublished", value),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        pickPlayer(fixture.a, edition.slug, {
          ...value,
          candidateId: fixture.a.osuId,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await command("pause");
      await expect(
        pickPlayer(fixture.a, edition.slug, value),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        pickPlayer(fixture.staff, edition.slug, value),
      ).rejects.toMatchObject({ status: 409 });
      await command("resume");
      await expect(
        pickPlayer(fixture.staff, edition.slug, await input()),
      ).resolves.toMatchObject({ corrected: false });
    });
    it("undo is explicit and publishes the correction atomically before resumed picks", async () => {
      const value = await input();
      await pickPlayer(fixture.a, edition.slug, value);
      await command("publish");
      await command("pause");
      await command("undo");
      const state = await staffDraft(fixture.staff, edition.slug);
      expect(state.session?.turnIndex).toBe(0);
      expect(state.picks[0].voidedAt).not.toBeNull();
      expect(
        state.members.filter((m) => m.membership.origin === "draft"),
      ).toHaveLength(0);
      expect((await publicDraft(edition.slug))?.picks).toHaveLength(0);
      expect((await publicDraft(edition.slug))?.picks).toHaveLength(0);
      expect(
        (await ownTeam(fixture.a.osuId, edition.slug))?.members,
      ).toHaveLength(1);
      await command("resume");
      await command("publish");
      const next = await pickPlayer(fixture.a, edition.slug, await input());
      expect(next.corrected).toBe(false);
      expect((await pickPlayer(fixture.a, edition.slug, value)).corrected).toBe(
        true,
      );
    });
    it("aborts safely and reopens setup only through audited recovery", async () => {
      await pickPlayer(fixture.staff, edition.slug, await input());
      await command("pause");
      await command("abort");
      await command("publish");
      expect((await publicDraft(edition.slug))?.state).toBe("aborted");
      const recovered = await command("recover");
      expect(recovered.session?.state).toBe("setup");
      expect(recovered.edition?.lockedAt).toBeNull();
      expect(await publicDraft(edition.slug)).toBeNull();
      expect(recovered.picks[0].voidedAt).not.toBeNull();
    });
    it("reconstructs an ongoing draft in a fresh Node.js process", async () => {
      await pickPlayer(fixture.staff, edition.slug, await input());
      const before = await staffDraft(fixture.staff, edition.slug);
      await closeDb();
      const expected = createHash("sha256")
        .update(
          JSON.stringify({
            session: before.session,
            picks: before.picks,
            members: before.members,
          }),
        )
        .digest("hex");
      const code = `import { staffDraft } from './src/lib/draft-reads.ts'; import { closeDb } from './src/db/index.ts'; import { createHash } from 'node:crypto'; const data = await staffDraft(${JSON.stringify(fixture.staff)}, ${JSON.stringify(edition.slug)}); console.log(createHash('sha256').update(JSON.stringify({session:data.session,picks:data.picks,members:data.members})).digest('hex')); await closeDb();`;
      const fresh = execFileSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", code],
        {
          cwd: process.cwd(),
          env: process.env,
          encoding: "utf8",
          timeout: 10000,
        },
      ).trim();
      expect(fresh).toBe(expected);
      const after = await staffDraft(fixture.staff, edition.slug);
      expect(after.session).toEqual(before.session);
      expect(after.picks).toEqual(before.picks);
      expect(after.members).toEqual(before.members);
    });
    it("finalizes only completed published picks and freezes team roster identities", async () => {
      await expect(command("finalize")).rejects.toMatchObject({ status: 409 });
      await pickPlayer(fixture.a, edition.slug, await input());
      await command("publish");
      await pickPlayer(
        fixture.staff,
        edition.slug,
        await input(fixture.players[1].osuId),
      );
      // Confirmed turns already publish the complete authoritative board.
      await command("finalize");
      expect(
        (await db().select().from(teams)).every(
          (t) => t.finalizedAt && !t.rosterPublished,
        ),
      ).toBe(true);
      await expect(command("undo")).rejects.toMatchObject({ status: 409 });
      await expect(command("abort")).rejects.toMatchObject({ status: 409 });
      await expect(
        pickPlayer(
          fixture.staff,
          edition.slug,
          await input(fixture.players[2].osuId),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect((await db().select().from(draftSessions))[0].state).toBe(
        "finalized",
      );
    });
  },
);
