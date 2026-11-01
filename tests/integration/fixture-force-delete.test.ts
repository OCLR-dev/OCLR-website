import { randomUUID } from "node:crypto";
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
import { db, closeDb } from "../../src/db";
import {
  fixtures,
  fixtureCommentators,
  editionEvents,
  matchImports,
  matchResults,
  resultRevisions,
  resultGameClaims,
  refereeEvents,
  refereeSessions,
  resultAuditEvents,
  mappools,
  teams,
  users,
  staffRoles,
} from "../../src/db/schema";
import { fixtureCommand } from "../../src/lib/fixtures";
import { previewFixtureForceDelete } from "../../src/lib/fixture-force-delete";
import {
  refereeCommand,
  refereeWorkspace,
  type RefereeWorkspace,
} from "../../src/lib/referee";
import {
  seedRefereeFixture,
  refereeTestAdmin as admin,
  refereeTestUser as referee,
} from "../fixtures/referee";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  "Admin force deletion of unapproved test fixtures",
  () => {
    let w: RefereeWorkspace;
    beforeAll(() => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
      w = (await seedRefereeFixture()).workspace;
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    const preview = () =>
      previewFixtureForceDelete(admin, "test-cup", {
        action: "preview_force_delete",
        fixtureId: w.fixture.id,
      });
    async function command() {
      const p = await preview();
      return {
        action: "force_delete",
        fixtureId: p.fixtureId,
        expectedVersion: p.version,
        expectedAssignmentRevision: p.assignmentRevision,
        expectedDeletionFingerprint: p.fingerprint,
        confirmationLabel: p.label,
        testFixtureConfirmed: true,
        confirmed: true,
      };
    }
    async function seedOwnedRecords() {
      const id = w.fixture.id;
      const [source] = await db()
        .select()
        .from(matchImports)
        .where(eq(matchImports.fixtureId, id));
      await db()
        .insert(resultRevisions)
        .values({
          fixtureId: id,
          revision: 1,
          importId: source.id,
          proposal: { synthetic: true },
          createdBy: admin.osuId,
        });
      await db()
        .update(matchResults)
        .set({ state: "submitted", currentRevision: 1 })
        .where(eq(matchResults.fixtureId, id));
      const connection = randomUUID();
      await db().execute(
        sql`INSERT INTO referee_irc_connections (id,fixture_id,edition_slug,actor_id,desktop_session_id,room_id,irc_username,status) VALUES (${connection},${id},'test-cup',${admin.osuId},${randomUUID()},12345,'SyntheticRef','connected')`,
      );
      await db().execute(
        sql`INSERT INTO referee_irc_commands (connection_id,fixture_id,actor_id,request_key,request_hash,text,target) VALUES (${connection},${id},${admin.osuId},${randomUUID()},${"a".repeat(64)},'!mp timer 60','#mp_12345')`,
      );
      await db().execute(
        sql`INSERT INTO referee_reconciliations (fixture_id,actor_id,request_key,payload_hash,revision,session_revision,dependency_fingerprint,attempt_id) VALUES (${id},${admin.osuId},${randomUUID()},${"a".repeat(64)},1,${w.session!.revision},${w.dependencyFingerprint},${randomUUID()})`,
      );
      await db().execute(
        sql`INSERT INTO fixture_streams (fixture_id,user_id,source,assigned_by,confirmed_time_zone) VALUES (${id},${admin.osuId},'staff',${admin.osuId},'UTC')`,
      );
      await db()
        .insert(fixtureCommentators)
        .values(
          [admin, referee].map((user) => ({
            fixtureId: id,
            userId: user.osuId,
            source: "staff" as const,
            assignedBy: admin.osuId,
            confirmedTimeZone: "UTC",
          })),
        );
      await db().execute(
        sql`INSERT INTO historical_statistics (edition_slug,mp_id,fixture_id,draft) VALUES ('test-cup',9999917,${id},'{"synthetic":true}'::jsonb)`,
      );
    }
    it("removes the complete fixture-owned graph, archives evidence, and preserves shared pools/teams", async () => {
      await seedOwnedRecords();
      await db()
        .update(fixtures)
        .set({ status: "in_progress" })
        .where(eq(fixtures.id, w.fixture.id));
      const pools = await db().select().from(mappools),
        teamRows = await db().select().from(teams);
      const request = await command();
      await db().execute(
        sql`UPDATE referee_irc_connections SET sequence=sequence+1,last_seen_at=now() WHERE fixture_id=${w.fixture.id}`,
      );
      await expect(
        fixtureCommand(admin, "test-cup", {
          action: "delete",
          fixtureId: w.fixture.id,
          expectedVersion: request.expectedVersion,
          expectedAssignmentRevision: request.expectedAssignmentRevision,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await fixtureCommand(admin, "test-cup", request);
      expect(await db().select().from(fixtures)).toHaveLength(0);
      expect(await db().select().from(fixtureCommentators)).toHaveLength(0);
      expect(await db().select().from(refereeSessions)).toHaveLength(0);
      expect(await db().select().from(refereeEvents)).toHaveLength(0);
      expect(await db().select().from(matchImports)).toHaveLength(0);
      expect(await db().select().from(resultRevisions)).toHaveLength(0);
      expect(await db().select().from(mappools)).toEqual(pools);
      expect(await db().select().from(teams)).toEqual(teamRows);
      const [audit] = await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.kind, "competition_fixture_delete"));
      expect(audit.detail).toMatchObject({
        force: true,
        deletionFingerprint: request.expectedDeletionFingerprint,
        counts: {
          imports: 1,
          games: 3,
          refereeSessions: 1,
          connections: 1,
          commands: 1,
          statistics: 1,
          commentators: 2,
        },
      });
      expect(audit.detail.archivedRecords).toMatchObject({
        commentators: expect.arrayContaining([
          expect.objectContaining({ user_id: String(admin.osuId) }),
          expect.objectContaining({ user_id: String(referee.osuId) }),
        ]),
        refereeEvents: expect.any(Array),
        resultRevisions: expect.any(Array),
      });
      await fixtureCommand(admin, "test-cup", request);
      expect(
        await db()
          .select()
          .from(editionEvents)
          .where(eq(editionEvents.kind, "competition_fixture_delete")),
      ).toHaveLength(1);
      await expect(
        refereeWorkspace(admin, "test-cup", w.fixture.id),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("requires typed acknowledgement, valid revisions and an unchanged execution snapshot", async () => {
      const request = await command();
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...request,
          testFixtureConfirmed: false,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...request,
          confirmationLabel: "Wrong fixture",
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        fixtureCommand(admin, "test-cup", {
          ...request,
          expectedVersion: request.expectedVersion + 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await db()
        .insert(resultAuditEvents)
        .values({
          fixtureId: w.fixture.id,
          actorId: admin.osuId,
          action: "source_checked",
          detail: { synthetic: true },
        });
      await expect(
        fixtureCommand(admin, "test-cup", request),
      ).rejects.toMatchObject({ status: 409 });
      expect(await db().select().from(fixtures)).toHaveLength(1);
    });
    it("checks current Admin grants and rejects Referee, Developer-only, remote and cross-edition requests", async () => {
      const request = await command();
      await expect(
        fixtureCommand(referee, "test-cup", request),
      ).rejects.toMatchObject({ status: 403 });
      const developer = { osuId: 891999, username: "Synthetic Developer" };
      await db().insert(users).values(developer);
      await db().insert(staffRoles).values({
        userId: developer.osuId,
        role: "developer",
        editionSlug: null,
        grantedBy: admin.osuId,
      });
      await expect(
        previewFixtureForceDelete(developer, "test-cup", {
          action: "preview_force_delete",
          fixtureId: w.fixture.id,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        fixtureCommand(developer, "test-cup", request),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        fixtureCommand(admin, "other-cup", request),
      ).rejects.toMatchObject({ status: 404 });
      vi.stubEnv("OCLR_DATA_SOURCE", "remote");
      try {
        await expect(
          fixtureCommand(admin, "test-cup", request),
        ).rejects.toThrow();
      } finally {
        vi.stubEnv("OCLR_DATA_SOURCE", "database");
      }
      expect(await db().select().from(fixtures)).toHaveLength(1);
    });
    it.each(["approved", "old_approval", "claim", "approval_audit"])(
      "retains protected %s history",
      async (mode) => {
        await seedOwnedRecords();
        const request = await command();
        if (mode === "approved")
          await db()
            .update(matchResults)
            .set({ state: "approved" })
            .where(eq(matchResults.fixtureId, w.fixture.id));
        if (mode === "old_approval")
          await db()
            .update(resultRevisions)
            .set({ approvedBy: admin.osuId, approvedAt: new Date() })
            .where(eq(resultRevisions.fixtureId, w.fixture.id));
        if (mode === "claim")
          await db().insert(resultGameClaims).values({
            editionSlug: "test-cup",
            fixtureId: w.fixture.id,
            externalGameId: 123,
          });
        if (mode === "approval_audit")
          await db()
            .insert(resultAuditEvents)
            .values({
              fixtureId: w.fixture.id,
              actorId: admin.osuId,
              action: "result_approve",
              detail: { synthetic: true },
            });
        expect((await preview()).blocker).toBe("official_result");
        await expect(
          fixtureCommand(admin, "test-cup", request),
        ).rejects.toMatchObject({ status: 409 });
        expect(await db().select().from(matchImports)).toHaveLength(1);
      },
    );
    it("keeps bracket references and published statistics protected", async () => {
      const [original] = await db()
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, w.fixture.id));
      const [dependent] = await db()
        .insert(fixtures)
        .values({
          ...original,
          id: randomUUID(),
          position: 99,
          label: "Synthetic downstream",
          homeSourceId: original.id,
          homeSourceOutcome: "winner",
        })
        .returning();
      expect((await preview()).blocker).toBe("bracket");
      await expect(
        fixtureCommand(admin, "test-cup", await command()),
      ).rejects.toMatchObject({ status: 409 });
      await db().delete(fixtures).where(eq(fixtures.id, dependent.id));
      await seedOwnedRecords();
      await db().execute(
        sql`UPDATE historical_statistics SET published='{"synthetic":true}'::jsonb WHERE fixture_id=${w.fixture.id}`,
      );
      expect((await preview()).blocker).toBe("published_statistics");
      await expect(
        fixtureCommand(admin, "test-cup", await command()),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("rolls back removed records when the durable audit fails", async () => {
      await seedOwnedRecords();
      const request = await command();
      await db().execute(
        sql`CREATE FUNCTION test_force_delete_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='competition_fixture_delete' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_force_delete_audit_failure BEFORE INSERT ON edition_events FOR EACH ROW EXECUTE FUNCTION test_force_delete_audit_failure()`,
      );
      try {
        await expect(
          fixtureCommand(admin, "test-cup", request),
        ).rejects.toThrow();
        expect((await preview()).fingerprint).toBe(
          request.expectedDeletionFingerprint,
        );
      } finally {
        await db().execute(
          sql`DROP FUNCTION test_force_delete_audit_failure() CASCADE`,
        );
      }
    });
    it("serializes force deletion against a new referee write without resurrecting the fixture", async () => {
      const request = await command();
      const writes = await Promise.allSettled([
        fixtureCommand(admin, "test-cup", request),
        refereeCommand(admin, "test-cup", w.fixture.id, {
          action: "save_settings",
          settings: {
            ...w.session!.settings,
            roomName: "Changed during confirmation",
          },
          requestKey: randomUUID(),
          expectedRevision: w.session!.revision,
          dependencyFingerprint: w.dependencyFingerprint,
        }),
      ]);
      if (writes[0].status === "fulfilled") {
        expect(writes[1].status).toBe("rejected");
        expect(await db().select().from(fixtures)).toHaveLength(0);
      } else {
        expect(writes[1].status).toBe("fulfilled");
        expect(await db().select().from(fixtures)).toHaveLength(1);
        expect((writes[0] as PromiseRejectedResult).reason).toMatchObject({
          status: 409,
        });
      }
    });
  },
);
