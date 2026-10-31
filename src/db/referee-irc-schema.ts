import {
  pgTable,
  boolean,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { fixtures, users } from "./schema";
import type { IrcMessage, IrcSelection } from "../lib/referee-irc-model";
export const refereeIrcConnections = pgTable(
  "referee_irc_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fixtureId: uuid("fixture_id")
      .notNull()
      .references(() => fixtures.id),
    editionSlug: text("edition_slug").notNull(),
    actorId: bigint("actor_id", { mode: "number" })
      .notNull()
      .references(() => users.osuId),
    desktopSessionId: uuid("desktop_session_id").notNull(),
    roomId: bigint("room_id", { mode: "number" }).notNull(),
    ircUsername: text("irc_username").notNull(),
    status: text("status").notNull().default("disconnected"),
    bpSync: boolean("bp_sync").notNull().default(false),
    sequence: integer("sequence").notNull().default(0),
    messages: jsonb("messages").$type<IrcMessage[]>().notNull().default([]),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("referee_irc_fixture").on(t.fixtureId)],
);
export const refereeIrcCommands = pgTable(
  "referee_irc_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => refereeIrcConnections.id),
    fixtureId: uuid("fixture_id")
      .notNull()
      .references(() => fixtures.id),
    actorId: bigint("actor_id", { mode: "number" })
      .notNull()
      .references(() => users.osuId),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    text: text("text").notNull(),
    target: text("target").notNull(),
    baselineMessageIds: jsonb("baseline_message_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    automation:
      jsonb("automation").$type<import("../lib/referee-sync").BpSyncMetadata>(),
    selection: jsonb("selection").$type<IrcSelection>(),
    status: text("status").notNull().default("queued"),
    recordError: text("record_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("referee_irc_request").on(t.fixtureId, t.actorId, t.requestKey),
    index("referee_irc_connection_commands").on(t.connectionId),
  ],
);
