import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  draftSessions,
  editionState,
  fixtures,
  memberships,
  playerSeasonAvailability,
  refereeEvents,
  refereeSessions,
  registrations,
  scheduleAvailability,
  teams,
  tournamentRounds,
  tournamentStages,
  users,
} from "../../src/db/schema";
import {
  draftSessionReadColumns,
  fixtureAvailabilityReadColumns,
  registrationReadColumns,
  seasonAvailabilityReadColumns,
} from "../../src/lib/live-season-columns";
import { assertTestDatabase } from "../database";

const base = process.env.TEST_DATABASE_URL;
describe.skipIf(!base)("live-season relational upgrade (#980)", () => {
  it("preserves saved owners and ordered values and synchronizes legacy writes", async () => {
    assertTestDatabase(base);
    const name = `oclr_live_migration_${randomUUID().replaceAll("-", "")}_test`;
    const url = new URL(base);
    url.pathname = `/${name}`;
    const admin = new Pool({ connectionString: base });
    const pool = new Pool({ connectionString: url.toString() });
    const folder = mkdtempSync(join(tmpdir(), "oclr-live-migration-test-"));
    try {
      await admin.query(
        `CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`,
      );
      const journal = JSON.parse(
        readFileSync("drizzle/meta/_journal.json", "utf8"),
      );
      const cutover = journal.entries.findIndex(
        (entry: { tag: string }) =>
          entry.tag === "0092_live_season_relational_queries",
      );
      expect(cutover).toBeGreaterThan(0);
      journal.entries = journal.entries.slice(0, cutover);
      mkdirSync(join(folder, "meta"));
      writeFileSync(
        join(folder, "meta/_journal.json"),
        JSON.stringify(journal),
      );
      for (const entry of journal.entries)
        copyFileSync(
          `drizzle/${entry.tag}.sql`,
          join(folder, `${entry.tag}.sql`),
        );
      const db = drizzle(pool);
      await migrate(db, { migrationsFolder: folder });

      const slug = "s11-relations-test",
        userId = 980001,
        otherId = 980002;
      await db.insert(editionState).values({ slug });
      await db.insert(users).values([
        { osuId: userId, username: "Synthetic player" },
        { osuId: otherId, username: "Synthetic captain" },
      ]);
      const [application] = await db
        .insert(registrations)
        .values({
          editionSlug: slug,
          userId,
          answers: { bio: "合成文字", optional: "" },
          attempt: 2,
        })
        .returning();
      const [home, away] = await db
        .insert(teams)
        .values([
          { editionSlug: slug, captainId: userId, name: "Synthetic home" },
          { editionSlug: slug, captainId: otherId, name: "Synthetic away" },
        ])
        .returning();
      const [member] = await db
        .insert(memberships)
        .values({
          editionSlug: slug,
          teamId: home.id,
          userId,
          origin: "captain",
        })
        .returning();
      const [stage] = await db
        .insert(tournamentStages)
        .values({ editionSlug: slug, kind: "group" })
        .returning();
      const [round] = await db
        .insert(tournamentRounds)
        .values({
          editionSlug: slug,
          stageId: stage.id,
          name: "Synthetic round",
          position: 1,
        })
        .returning();
      const [fixture] = await db
        .insert(fixtures)
        .values({
          editionSlug: slug,
          roundId: round.id,
          label: "Synthetic fixture",
          timeZone: "Asia/Taipei",
          position: 1,
        })
        .returning();
      const intervals = [
        {
          start: "2026-12-03T20:15:30.1234567+08:00",
          end: "2026-12-03T21:00:00+08:00",
        },
        { start: "2026-12-01T10:00:00Z", end: "2026-12-01T12:00:00Z" },
      ];
      const [availability] = await db
        .insert(scheduleAvailability)
        .values({
          fixtureId: fixture.id,
          userId,
          membershipId: member.id,
          intervals,
          version: 3,
        })
        .returning();
      const [timetable] = await db
        .insert(playerSeasonAvailability)
        .values({
          editionSlug: slug,
          userId,
          version: 4,
          intervals: [intervals[0], { ...intervals[1], status: "unsure" }],
        })
        .returning();
      const [draft] = await db
        .insert(draftSessions)
        .values({
          editionSlug: slug,
          version: 5,
          pool: [otherId, userId],
          turnSequence: [away.id, home.id, home.id, away.id],
        })
        .returning();

      // An earlier release wrote only the event payload, with no typed outcome columns.
      const outcome = {
        type: "attempt_resolved",
        pickId: randomUUID(),
        attemptId: randomUUID(),
        status: "completed",
        winnerTeamId: home.id,
      } as const;
      const eventId = randomUUID();
      await db.execute(sql`
        INSERT INTO ${refereeSessions}
          (fixture_id, edition_slug, revision, settings, dependency_fingerprint, basis)
        VALUES (${fixture.id}, ${slug}, 1, '{}'::jsonb, ${"0".repeat(64)}, '{}'::jsonb)
      `);
      await db.execute(sql`
        INSERT INTO ${refereeEvents}
          (id, fixture_id, ordinal, actor_id, request_key, request_hash, payload)
        VALUES (${eventId}, ${fixture.id}, 1, ${userId}, ${randomUUID()},
                ${"0".repeat(64)}, ${JSON.stringify(outcome)}::jsonb)
      `);

      await migrate(db, { migrationsFolder: "drizzle" });
      await migrate(db, { migrationsFolder: "drizzle" });
      expect(
        await db
          .select()
          .from(refereeEvents)
          .where(eq(refereeEvents.id, eventId)),
      ).toMatchObject([
        {
          payload: outcome,
          resolvedPickId: outcome.pickId,
          resolvedAttemptId: outcome.attemptId,
          resolvedStatus: outcome.status,
          resolvedWinnerTeamId: outcome.winnerTeamId,
        },
      ]);
      expect(
        await db
          .select()
          .from(registrations)
          .where(eq(registrations.id, application.id)),
      ).toEqual([application]);
      expect(await db.select().from(scheduleAvailability)).toEqual([
        availability,
      ]);
      expect(await db.select().from(playerSeasonAvailability)).toEqual([
        timetable,
      ]);
      expect(await db.select().from(draftSessions)).toEqual([draft]);
      expect(
        await db
          .select(registrationReadColumns)
          .from(registrations)
          .where(eq(registrations.id, application.id)),
      ).toEqual([application]);
      expect(
        await db
          .select(fixtureAvailabilityReadColumns)
          .from(scheduleAvailability),
      ).toEqual([availability]);
      expect(
        await db
          .select(seasonAvailabilityReadColumns)
          .from(playerSeasonAvailability),
      ).toEqual([timetable]);
      expect(
        await db.select(draftSessionReadColumns).from(draftSessions),
      ).toEqual([draft]);

      // Old writers still write the JSONB fields. The same transaction updates
      // the typed rows even when a legacy write leaves the version unchanged.
      await db
        .update(registrations)
        .set({ answers: { bio: "Updated synthetic answer" } })
        .where(eq(registrations.id, application.id));
      await db
        .update(scheduleAvailability)
        .set({ intervals: [] })
        .where(eq(scheduleAvailability.fixtureId, fixture.id));
      await db
        .update(playerSeasonAvailability)
        .set({ intervals: [{ ...intervals[1], status: "available" }] })
        .where(eq(playerSeasonAvailability.editionSlug, slug));
      await db
        .update(draftSessions)
        .set({ pool: [userId], turnSequence: [home.id, away.id] })
        .where(eq(draftSessions.id, draft.id));
      expect(
        await db
          .select(registrationReadColumns)
          .from(registrations)
          .where(eq(registrations.id, application.id)),
      ).toEqual([
        { ...application, answers: { bio: "Updated synthetic answer" } },
      ]);
      expect(
        await db
          .select(fixtureAvailabilityReadColumns)
          .from(scheduleAvailability),
      ).toEqual([{ ...availability, intervals: [] }]);
      expect(
        await db
          .select(seasonAvailabilityReadColumns)
          .from(playerSeasonAvailability),
      ).toEqual([
        { ...timetable, intervals: [{ ...intervals[1], status: "available" }] },
      ]);
      const updatedDraft = {
        ...draft,
        pool: [userId],
        turnSequence: [home.id, away.id],
      };
      expect(
        await db.select(draftSessionReadColumns).from(draftSessions),
      ).toEqual([updatedDraft]);

      await expect(
        db
          .update(draftSessions)
          .set({ pool: sql`'[980001.5]'::jsonb`, turnSequence: [] })
          .where(eq(draftSessions.id, draft.id)),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await db.select().from(draftSessions)).toEqual([updatedDraft]);
      expect(
        await db.select(draftSessionReadColumns).from(draftSessions),
      ).toEqual([updatedDraft]);
    } finally {
      await pool.end();
      try {
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await admin.end();
        rmSync(folder, { recursive: true, force: true });
      }
    }
  }, 60000);
});
