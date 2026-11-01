import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  bigint,
  integer,
  boolean,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { fixtures, users, matchImports, refereeEvents } from "./schema";
import type { MpIssue } from "../lib/referee-mp-model";
export const refereeMpBindings = pgTable(
  "referee_mp_bindings",
  {
    fixtureId: uuid("fixture_id")
      .primaryKey()
      .references(() => fixtures.id, { onDelete: "cascade" }),
    matchId: bigint("match_id", { mode: "number" }).notNull(),
    revision: integer("revision").notNull(),
    enabled: boolean("enabled").notNull(),
    dependencyFingerprint: text("dependency_fingerprint").notNull(),
    actorId: bigint("actor_id", { mode: "number" })
      .notNull()
      .references(() => users.osuId),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextPollAt: timestamp("next_poll_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseId: uuid("lease_id"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    importId: uuid("import_id").references(() => matchImports.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    issues: jsonb("issues").$type<MpIssue[]>().notNull().default([]),
    issueCount: integer("issue_count").notNull().default(0),
  },
  (t) => [
    check(
      "referee_mp_binding_values",
      sql`${t.matchId} > 0 AND ${t.matchId} <= 9007199254740991 AND ${t.revision} > 0 AND ${t.issueCount} >= 0`,
    ),
    check(
      "referee_mp_binding_fingerprint",
      sql`${t.dependencyFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
export const refereeMpScores = pgTable(
  "referee_mp_scores",
  {
    attemptId: uuid("attempt_id").primaryKey(),
    fixtureId: uuid("fixture_id")
      .notNull()
      .references(() => fixtures.id, { onDelete: "cascade" }),
    pickId: uuid("pick_id").notNull(),
    matchId: bigint("match_id", { mode: "number" }).notNull(),
    gameId: bigint("game_id", { mode: "number" }).notNull(),
    gameHash: text("game_hash").notNull(),
    eventId: uuid("event_id").references(() => refereeEvents.id, {
      onDelete: "set null",
    }),
    review: boolean("review").notNull().default(false),
  },
  (t) => [
    uniqueIndex("referee_mp_game_once").on(t.gameId),
    check(
      "referee_mp_score_values",
      sql`${t.gameId} > 0 AND ${t.gameId} <= 9007199254740991 AND ${t.matchId} > 0 AND ${t.matchId} <= 9007199254740991`,
    ),
    check("referee_mp_score_hash", sql`${t.gameHash} ~ '^[a-f0-9]{64}$'`),
  ],
);
