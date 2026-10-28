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
  users,
  staffRoles,
  editionEvents,
  editionRevisions,
  editionState,
} from "../../src/db/schema";
import { readTournament, tournamentCommand } from "../../src/lib/tournaments";
import { lookupArchiveStaffIdentity } from "../../src/lib/archive-staff-identity";
import { getOsuProfileByUsername } from "../../src/lib/osu-profiles";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { publicHistoricalArchive } from "../../src/lib/historical-archive";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { profileResponse } from "../fixtures/osu-profile";

vi.mock("../../src/lib/osu-profiles", () => ({
  getOsuProfileByUsername: vi.fn(),
}));
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 375001, username: "Synthetic Archive Admin" };
const scoped = { osuId: 375002, username: "Synthetic Scoped Admin" };
const developer = { osuId: 375003, username: "Synthetic Developer" };
const archive = {
  ...historicalArchive,
  staff: [
    {
      username: "Old Staff Name",
      osuId: null,
      position: "裁判",
      source: "Staff!A2",
    },
    {
      username: "Known Staff",
      osuId: 91005,
      position: "Streamer",
      source: "Staff!A3",
    },
  ],
};
const lookup = {
  staffIndex: 0,
  username: "[Test Player]",
  expectedRevision: 0,
};
const command = {
  ...lookup,
  action: "resolve-archive-staff",
  confirmed: true,
  identityConfirmed: true,
  source: "Synthetic independent confirmation",
  osuId: 983001,
};
const snapshot = () => ({
  profile: normalizeOsuProfile(
    { ...profileResponse, id: 983001, username: "[Test Player]" },
    983001,
    "osu",
  ),
  stale: false,
  notice: null,
});

describe.skipIf(!url)(
  "historical staff lookup and versioned confirmation",
  () => {
    beforeAll(() => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      await db().insert(users).values([admin, scoped, developer]);
      await seedEditions([
        {
          ...edition,
          slug: archive.editionSlug,
          archive,
          status: "completed",
          registration: null,
          published: true,
        },
        { ...edition, slug: "another-test-cup" },
      ]);
      await db()
        .insert(staffRoles)
        .values([
          {
            userId: scoped.osuId,
            role: "admin",
            editionSlug: "another-test-cup",
            grantedBy: admin.osuId,
          },
          {
            userId: developer.osuId,
            role: "developer",
            editionSlug: null,
            grantedBy: admin.osuId,
          },
        ]);
      vi.mocked(getOsuProfileByUsername)
        .mockReset()
        .mockResolvedValue(snapshot());
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    it("looks up without linking, then saves only a confirmed UID with a revision and audit", async () => {
      expect(
        await lookupArchiveStaffIdentity(admin, archive.editionSlug, lookup),
      ).toMatchObject({ osuId: 983001, username: "[Test Player]" });
      expect(
        (await readTournament(archive.editionSlug))?.edition.archive,
      ).toEqual(archive);
      await tournamentCommand(admin, archive.editionSlug, command);
      const saved = await readTournament(archive.editionSlug);
      expect(saved?.revision).toBe(1);
      expect(saved?.edition.archive?.staff).toEqual([
        { ...archive.staff[0], osuId: 983001 },
        archive.staff[1],
      ]);
      expect(saved?.edition.archive?.players).toEqual(archive.players);
      expect(saved?.edition.archive?.matches).toEqual(archive.matches);
      expect(
        publicHistoricalArchive(saved!.edition.archive!).sourceFacts,
      ).toBeUndefined();
      expect(await db().select().from(users)).toHaveLength(3);
      expect(await db().select().from(staffRoles)).toHaveLength(2);
      const events = await db().select().from(editionEvents);
      expect(events).toHaveLength(1);
      expect(events[0].detail).toMatchObject({
        identityConfirmation: {
          historicalName: archive.staff[0].username,
          currentUsername: command.username,
          osuId: command.osuId,
          source: command.source,
        },
      });
      expect(
        JSON.stringify(publicHistoricalArchive(saved!.edition.archive!)),
      ).not.toContain(command.source);
      expect(
        await db()
          .select()
          .from(editionRevisions)
          .where(eq(editionRevisions.editionSlug, archive.editionSlug)),
      ).toHaveLength(2);
      await expect(
        tournamentCommand(admin, archive.editionSlug, command),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("rejects other scopes, Developer, remote and invalid selection before provider access", async () => {
      for (const actor of [scoped, developer]) {
        await expect(
          lookupArchiveStaffIdentity(actor, archive.editionSlug, lookup),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          tournamentCommand(actor, archive.editionSlug, command),
        ).rejects.toMatchObject({ status: 403 });
      }
      for (const change of [
        { staffIndex: 1 },
        { staffIndex: 199 },
        { expectedRevision: 9 },
      ]) {
        await expect(
          lookupArchiveStaffIdentity(admin, archive.editionSlug, {
            ...lookup,
            ...change,
          }),
        ).rejects.toMatchObject({ status: 409 });
      }
      await expect(
        lookupArchiveStaffIdentity(admin, archive.editionSlug, {
          ...lookup,
          username: " ",
        }),
      ).rejects.toMatchObject({ status: 400 });
      vi.stubEnv("OCLR_DATA_SOURCE", "remote");
      try {
        await expect(
          lookupArchiveStaffIdentity(admin, archive.editionSlug, lookup),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        vi.stubEnv("OCLR_DATA_SOURCE", "database");
      }
      expect(getOsuProfileByUsername).not.toHaveBeenCalled();
    });
    it("rejects forged UID, stale fallback, provider errors and a missing historical match acknowledgement", async () => {
      await expect(
        tournamentCommand(admin, archive.editionSlug, {
          ...command,
          osuId: 983002,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        tournamentCommand(admin, archive.editionSlug, {
          ...command,
          identityConfirmed: false,
        }),
      ).rejects.toMatchObject({ status: 400 });
      vi.mocked(getOsuProfileByUsername).mockResolvedValue({
        ...snapshot(),
        stale: true,
      });
      await expect(
        lookupArchiveStaffIdentity(admin, archive.editionSlug, lookup),
      ).rejects.toMatchObject({ status: 503 });
      vi.mocked(getOsuProfileByUsername).mockRejectedValue({ status: 429 });
      await expect(
        tournamentCommand(admin, archive.editionSlug, command),
      ).rejects.toMatchObject({ status: 429 });
      expect((await readTournament(archive.editionSlug))?.revision).toBe(0);
      expect(await db().select().from(editionEvents)).toHaveLength(0);
    });
    it("rechecks revision changes after provider I/O", async () => {
      vi.mocked(getOsuProfileByUsername).mockImplementationOnce(async () => {
        await db()
          .update(editionState)
          .set({ configurationVersion: 1 })
          .where(eq(editionState.slug, archive.editionSlug));
        return snapshot();
      });
      await expect(
        lookupArchiveStaffIdentity(admin, archive.editionSlug, lookup),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await readTournament(archive.editionSlug))?.edition.archive?.staff[0]
          .osuId,
      ).toBeNull();
      expect(await db().select().from(editionEvents)).toHaveLength(0);
    });
    it("serializes concurrent confirmations without duplicate revisions or audit events", async () => {
      const results = await Promise.allSettled([
        tournamentCommand(admin, archive.editionSlug, command),
        tournamentCommand(admin, archive.editionSlug, command),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toMatchObject([
        { reason: { status: 409 } },
      ]);
      expect((await readTournament(archive.editionSlug))?.revision).toBe(1);
      expect(await db().select().from(editionEvents)).toHaveLength(1);
    });
    it("rechecks revoked edition grants after provider I/O", async () => {
      await db().insert(staffRoles).values({
        userId: scoped.osuId,
        role: "admin",
        editionSlug: archive.editionSlug,
        grantedBy: admin.osuId,
      });
      vi.mocked(getOsuProfileByUsername).mockImplementationOnce(async () => {
        await db()
          .delete(staffRoles)
          .where(eq(staffRoles.userId, scoped.osuId));
        return snapshot();
      });
      await expect(
        lookupArchiveStaffIdentity(scoped, archive.editionSlug, lookup),
      ).rejects.toMatchObject({ status: 403 });
      expect((await readTournament(archive.editionSlug))?.revision).toBe(0);
      expect(await db().select().from(editionEvents)).toHaveLength(0);
    });
  },
);
