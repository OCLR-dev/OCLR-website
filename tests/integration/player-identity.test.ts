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
import { readFileSync } from "node:fs";
import { db, closeDb } from "../../src/db";
import {
  editionState,
  playerNames,
  registrations,
  userProfileCache,
  staffRoles,
  users,
} from "../../src/db/schema";
import { publicPlayer, publicPlayers } from "../../src/lib/players";
import {
  publishedPlayerProfile,
  staffOclrPlayerProfile,
} from "../../src/lib/player-profiles";
import { createSession, readSessionContext } from "../../src/lib/auth/sessions";
import { createDeveloperToken } from "../../src/lib/developer-api";
import {
  knownPlayerIdentity,
  observeLoginNames,
} from "../../src/lib/player-identity";
import { publicPlayerDirectoryModel } from "../../src/lib/public-read-models";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { readApiRoute } from "../../src/lib/read-api";
import { profileResponse } from "../fixtures/osu-profile";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
const url = process.env.TEST_DATABASE_URL;
const uid = 360001;
const archive = {
  ...historicalArchive,
  editionSlug: "identity-history",
  players: historicalArchive.players.map((p, i) => ({
    ...p,
    osuId: i === 2 ? uid : p.osuId,
  })),
  picks: historicalArchive.picks.map((p) => ({ ...p, osuId: uid })),
};
describe.skipIf(!url)(
  "UID identity, durable name evidence and publication",
  () => {
    beforeAll(() => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("APP_URL", "https://oclr.example.test");
    });
    beforeEach(async () => {
      await db().execute(
        sql`TRUNCATE edition_state, users, user_profile_cache, player_names CASCADE`,
      );
      await seedEditions([
        edition,
        {
          ...edition,
          slug: archive.editionSlug,
          status: "completed",
          registration: null,
          archive,
        },
      ]);
      await db()
        .insert(users)
        .values({ osuId: uid, username: "Current identity" });
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    async function cache(
      username: string,
      previous: string[] = [],
      fetchedAt = new Date().toISOString(),
    ) {
      const profile = normalizeOsuProfile(
        { ...profileResponse, id: uid, username, previous_usernames: previous },
        uid,
        "osu",
        fetchedAt,
      );
      await db()
        .insert(userProfileCache)
        .values({
          osuId: uid,
          mode: "osu",
          profile,
          attemptedAt: new Date(),
          retryAt: new Date(0),
        })
        .onConflictDoUpdate({
          target: [userProfileCache.osuId, userProfileCache.mode],
          set: { profile },
        });
    }
    it("opens login-only and non-public applicants for self, never for anonymous callers", async () => {
      await seedEditions([
        {
          ...edition,
          slug: archive.editionSlug,
          status: "completed",
          registration: null,
          archive,
          published: false,
        },
      ]);
      for (const status of [
        null,
        "pending",
        "rejected",
        "withdrawn",
      ] as const) {
        if (status)
          await db()
            .insert(registrations)
            .values({
              userId: uid,
              editionSlug: edition.slug,
              status,
              rulesVersion: "test-v1",
              answers: { secret: "PRIVATE_360" },
            })
            .onConflictDoUpdate({
              target: [registrations.editionSlug, registrations.userId],
              set: { status },
            });
        const data = await publishedPlayerProfile(
          String(uid),
          "osu",
          undefined,
          uid,
          true,
        );
        expect(data.identity.username).toBe("Current identity");
        expect(data.participation).toEqual([]);
        expect(data.snapshot).toBeNull();
        expect(JSON.stringify(data)).not.toContain("PRIVATE_360");
        await expect(
          publishedPlayerProfile(
            String(uid),
            "osu",
            undefined,
            undefined,
            true,
          ),
        ).rejects.toMatchObject({ status: 404 });
      }
    });
    it("aggregates cross-season native/archive facts once and keeps original names, roles, sources and results", async () => {
      await db()
        .insert(registrations)
        .values([
          {
            userId: uid,
            editionSlug: edition.slug,
            status: "accepted",
            rulesVersion: "test-v1",
            answers: {},
          },
          {
            userId: uid,
            editionSlug: archive.editionSlug,
            status: "accepted",
            rulesVersion: "test-v1",
            answers: {},
          },
        ]);
      const facts = await publicPlayer(uid);
      expect(facts).toHaveLength(2);
      expect(
        facts.find((p) => p.editionSlug === archive.editionSlug),
      ).toMatchObject({
        username: "Historical Player",
        participation: "historical",
        role: "player",
        sourceReference: "Teams!C2",
        placing: 1,
      });
      expect(await publicPlayer(uid, archive.editionSlug)).toHaveLength(1);
      const profile = await publishedPlayerProfile(
        String(uid),
        "osu",
        undefined,
        undefined,
        true,
      );
      expect(profile.identity.names.map((n) => n.username)).toContain(
        "Historical Player",
      );
    });
    it("does not create accounts for history-only UIDs or fetch arbitrary external UIDs", async () => {
      await db().delete(users).where(eq(users.osuId, uid));
      expect(
        (
          await publishedPlayerProfile(
            String(uid),
            "mania",
            undefined,
            undefined,
            true,
          )
        ).participation,
      ).toHaveLength(1);
      expect(await db().select().from(users)).toEqual([]);
      await expect(
        publishedPlayerProfile("999999999", "osu"),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("retains successive provider/login names and provenance after empty, failed and repeated snapshots", async () => {
      await cache("First", ["Older"]);
      await cache("Second", []);
      await cache("Second", []);
      await observeLoginNames(uid, ["Login alias", "Login alias"]);
      await db()
        .update(users)
        .set({ username: "Third" })
        .where(eq(users.osuId, uid));
      await db()
        .update(userProfileCache)
        .set({ profile: null, errorStatus: 502 })
        .where(eq(userProfileCache.osuId, uid));
      const facts = await publicPlayer(uid);
      const identity = await knownPlayerIdentity(uid, facts, uid);
      expect(identity.names.map((n) => n.username)).toEqual(
        expect.arrayContaining([
          "First",
          "Older",
          "Second",
          "Login alias",
          "Current identity",
          "Third",
          "Historical Player",
        ]),
      );
      expect(
        identity.names.filter((n) => n.username === "Second"),
      ).toHaveLength(1);
      expect(
        identity.names.find((n) => n.username === "Older")?.evidence[0],
      ).toMatchObject({
        source: "osu_previous",
        reference: "osu",
        firstObservedAt: expect.any(String),
      });
    });
    it("backfills provider-name observation times and retains aliases when previous names later empty", async () => {
      const fetchedAt = "2024-03-04T05:06:07.000Z";
      await cache("Provider first", ["Retained provider alias"], fetchedAt);
      await db().execute(sql`TRUNCATE player_names`);
      await db().execute(sql`
        SELECT oclr_observe_profile(osu_id, mode, profile, NULL)
        FROM user_profile_cache
      `);

      const firstAlias = await db()
        .select()
        .from(playerNames)
        .where(eq(playerNames.username, "Retained provider alias"));
      expect(firstAlias).toHaveLength(1);
      expect(firstAlias[0]).toMatchObject({
        source: "osu_previous",
        published: true,
        firstObservedAt: new Date(fetchedAt),
        lastObservedAt: new Date(fetchedAt),
      });

      await cache("Provider second", [], "2025-04-05T06:07:08.000Z");
      expect(
        await db()
          .select()
          .from(playerNames)
          .where(eq(playerNames.username, "Retained provider alias")),
      ).toEqual(firstAlias);

      const invalidDateProfile = normalizeOsuProfile(
        {
          ...profileResponse,
          id: uid,
          username: "Unknown observation date",
          previous_usernames: ["Unknown date alias"],
        },
        uid,
        "osu",
        "infinity",
      );
      await db().execute(sql`
        SELECT oclr_observe_profile(
          ${uid}::bigint,
          'osu',
          ${JSON.stringify(invalidDateProfile)}::jsonb,
          NULL
        )
      `);
      const unknownDate = await db()
        .select()
        .from(playerNames)
        .where(eq(playerNames.username, "Unknown date alias"));
      expect(unknownDate).toHaveLength(1);
      expect(unknownDate[0]).toMatchObject({
        firstObservedAt: null,
        lastObservedAt: null,
      });
    });
    it("searches only publicly verified aliases by UID, never merges equal usernames", async () => {
      await cache("Provider now", ["Public old name"]);
      await observeLoginNames(uid, ["PRIVATE_LOGIN_NAME"]);
      await db()
        .insert(users)
        .values({ osuId: uid + 1, username: "Public old name" });
      await db()
        .insert(registrations)
        .values(
          [uid, uid + 1].map((userId) => ({
            userId,
            editionSlug: edition.slug,
            status: "accepted" as const,
            rulesVersion: "test-v1",
            answers: {},
          })),
        );
      const found = await publicPlayers({
        edition: edition.slug,
        q: "Public old name",
      });
      expect(found.rows.map((p) => p.osuId)).toEqual(
        expect.arrayContaining([uid, uid + 1]),
      );
      expect(
        (
          await publicPlayers({
            edition: edition.slug,
            q: "PRIVATE_LOGIN_NAME",
          })
        ).rows,
      ).toEqual([]);
      expect(
        (
          await publicPlayerDirectoryModel(
            archive.editionSlug,
            "Public old name",
          )
        ).rows.map((p) => p.osuId),
      ).toEqual([uid]);
      expect(
        (await publicPlayerDirectoryModel(archive.editionSlug, String(uid)))
          .rows,
      ).toHaveLength(1);
    });
    it("does not leak unpublished archive names or evidence even for a public participant", async () => {
      await seedEditions([
        {
          ...edition,
          slug: "identity-secret",
          published: false,
          status: "completed",
          registration: null,
          archive: {
            ...archive,
            editionSlug: "identity-secret",
            players: archive.players.map((p) =>
              p.osuId === uid ? { ...p, username: "PRIVATE_ARCHIVE_NAME" } : p,
            ),
          },
        },
      ]);
      const facts = await publicPlayer(uid);
      expect(
        JSON.stringify(await knownPlayerIdentity(uid, facts)),
      ).not.toContain("PRIVATE_ARCHIVE_NAME");
      expect(
        JSON.stringify(await knownPlayerIdentity(uid, facts, uid)),
      ).toContain("PRIVATE_ARCHIVE_NAME");
      await db()
        .update(editionState)
        .set({
          configuration: {
            ...edition,
            status: "completed",
            registration: null,
            archive,
            published: false,
          },
        })
        .where(eq(editionState.slug, archive.editionSlug));
      await expect(
        knownPlayerIdentity(uid, await publicPlayer(uid)),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("keeps private archive aliases private after a later rename and publication", async () => {
      const slug = "identity-renamed-private";
      const privateArchive = {
        ...archive,
        editionSlug: slug,
        players: archive.players.map((person) =>
          person.osuId === uid
            ? { ...person, username: "PRIVATE_ARCHIVE_NAME" }
            : person,
        ),
      };
      await seedEditions([
        {
          ...edition,
          slug,
          status: "completed",
          registration: null,
          published: false,
          archive: privateArchive,
        },
      ]);

      const privateSelf = await publishedPlayerProfile(
        String(uid),
        "osu",
        undefined,
        uid,
        true,
      );
      expect(JSON.stringify(privateSelf.identity)).toContain(
        "PRIVATE_ARCHIVE_NAME",
      );

      const publishedArchive = {
        ...privateArchive,
        players: privateArchive.players.map((person) =>
          person.osuId === uid
            ? { ...person, username: "PUBLIC_ARCHIVE_NAME" }
            : person,
        ),
      };
      await seedEditions([
        {
          ...edition,
          slug,
          status: "completed",
          registration: null,
          published: true,
          archive: publishedArchive,
        },
      ]);

      const anonymous = await publishedPlayerProfile(
        String(uid),
        "osu",
        undefined,
        undefined,
        true,
      );
      expect(JSON.stringify(anonymous)).toContain("PUBLIC_ARCHIVE_NAME");
      expect(JSON.stringify(anonymous)).not.toContain("PRIVATE_ARCHIVE_NAME");
      expect(
        (await publicPlayerDirectoryModel(slug, "PRIVATE_ARCHIVE_NAME")).rows,
      ).toEqual([]);
      expect(
        (
          await publicPlayerDirectoryModel(slug, "PUBLIC_ARCHIVE_NAME")
        ).rows.map((person) => person.osuId),
      ).toContain(uid);

      const self = await publishedPlayerProfile(
        String(uid),
        "osu",
        undefined,
        uid,
        true,
      );
      expect(JSON.stringify(self.identity)).toContain("PRIVATE_ARCHIVE_NAME");
    });
    it("replays the backfill without duplicates and leaves original source data untouched and unknown times unknown", async () => {
      const original = await db().select().from(editionState);
      await db().execute(sql`TRUNCATE player_names`);
      const backfill = readFileSync(
        "drizzle/0049_player_name_history.sql",
        "utf8",
      ).split("-- Re-entrant backfill:")[1];
      const statements = backfill.slice(backfill.indexOf("SELECT"));
      await db().execute(sql.raw(statements));
      const once = await db().select().from(playerNames);
      await db().execute(sql.raw(statements));
      expect(await db().select().from(playerNames)).toEqual(once);
      expect(
        once.every(
          (n) => n.firstObservedAt === null && n.lastObservedAt === null,
        ),
      ).toBe(true);
      expect(await db().select().from(editionState)).toEqual(original);
      expect(once.filter((n) => n.osuId === uid)).toHaveLength(2);
    });
    it("keeps API reads saved-only and public, with no private account names or writes", async () => {
      const before = await db().select().from(playerNames);
      const result = await readApiRoute(
        new Request(
          `https://oclr.example.test/api/v1/players/${uid}/oclr-profile`,
        ),
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.data.identity.osuId).toBe(uid);
      expect(JSON.stringify(body)).not.toContain("Current identity");
      expect(await db().select().from(playerNames)).toEqual(before);
      const own = await readApiRoute(
        new Request("https://oclr.example.test/api/v1/me/oclr-profile"),
      );
      expect(own.status).toBe(401);
    });
    it("binds private identity API reads to the actual token subject and required scope", async () => {
      vi.stubEnv("OCLR_DEVELOPER_ORIGINS", "http://localhost:4000");
      await db()
        .insert(staffRoles)
        .values({ userId: uid, role: "developer", grantedBy: uid });
      const session = (await readSessionContext(
        (await createSession(uid)).token,
      ))!;
      const token = await createDeveloperToken(session, {
        origin: "http://localhost:4000",
        scopes: ["identity:read"],
      });
      const headers = {
        Authorization: `Bearer ${token.token}`,
        Origin: "http://localhost:4000",
      };
      const own = await readApiRoute(
        new Request("https://oclr.example.test/api/v1/me/oclr-profile", {
          headers,
        }),
      );
      expect(own.status).toBe(200);
      expect((await own.json()).data.identity).toMatchObject({
        osuId: uid,
        username: "Current identity",
      });
      const other = await readApiRoute(
        new Request(
          `https://oclr.example.test/api/v1/players/${uid + 1}/oclr-profile`,
          { headers },
        ),
      );
      expect(other.status).toBe(403);
    });
    it("limits staff evidence to a live appointment, a related UID and that edition", async () => {
      const actor = { osuId: uid + 50, username: "Synthetic scoped admin" };
      await db().insert(users).values(actor);
      await db().insert(staffRoles).values({
        userId: actor.osuId,
        role: "admin",
        grantedBy: actor.osuId,
        editionSlug: edition.slug,
      });
      await db()
        .insert(registrations)
        .values({
          userId: uid,
          editionSlug: edition.slug,
          status: "pending",
          rulesVersion: "test-v1",
          answers: { secret: "PRIVATE_ANSWERS" },
        });
      await db().insert(playerNames).values({
        osuId: uid,
        username: "OTHER_PRIVATE_EDITION",
        source: "archive_player",
        editionSlug: "not-public",
        reference: "Private!A2",
      });
      const result = await staffOclrPlayerProfile(
        actor,
        String(uid),
        "osu",
        edition.slug,
      );
      expect(result.identity.username).toBe("Current identity");
      expect(JSON.stringify(result)).not.toContain("OTHER_PRIVATE_EDITION");
      expect(JSON.stringify(result)).not.toContain("PRIVATE_ANSWERS");
      await expect(
        staffOclrPlayerProfile(actor, String(uid), "osu", archive.editionSlug),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        staffOclrPlayerProfile(actor, String(uid + 1), "osu", edition.slug),
      ).rejects.toMatchObject({ status: 404 });
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, actor.osuId));
      await expect(
        staffOclrPlayerProfile(actor, String(uid), "osu", edition.slug),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("keeps unresolved archive people unassociated even when their names match a known account", async () => {
      await seedEditions([
        {
          ...edition,
          slug: archive.editionSlug,
          status: "completed",
          registration: null,
          archive: {
            ...archive,
            formatVersion: 2,
            unresolvedPlayers: [
              {
                id: "source-only",
                username: "Current identity",
                teamId: "alpha",
                role: "player",
                tier: null,
                source: "Unresolved!A2",
              },
            ],
          },
        },
      ]);
      expect(await publicPlayer(uid)).toHaveLength(1);
      const evidence = await db()
        .select()
        .from(playerNames)
        .where(eq(playerNames.reference, "Unresolved!A2"));
      expect(evidence).toEqual([]);
    });
  },
);
