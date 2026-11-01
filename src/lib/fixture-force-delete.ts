import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fixtures } from "@/db/schema";
import { assertCapability } from "./auth/staff";
import type { User } from "./auth/sessions";
import { assertOperationalEdition } from "./archive-guard";
import { HttpError } from "./http";
import {
  forceDeleteBlockerMessage,
  fixtureForceDeleteBlocker,
  type FixtureForceDeletePreview,
} from "./fixture-force-delete-model";
type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type Row = Record<string, unknown>;
type Fixture = typeof fixtures.$inferSelect;

/** Only fixture-owned rows. Never fetch desktop credentials or shared pool/team data. */
export async function fixtureDeletionSnapshot(tx: Tx, fixture: Fixture) {
  const rows = async (query: Parameters<Tx["execute"]>[0]) =>
    (await tx.execute(query)).rows as Row[];
  const id = fixture.id,
    slug = fixture.editionSlug;
  const snapshot = {
    fixture,
    imports: await rows(
      sql`SELECT * FROM match_imports WHERE fixture_id=${id} ORDER BY id`,
    ),
    games: await rows(
      sql`SELECT g.* FROM match_games g JOIN match_imports i ON i.id=g.import_id WHERE i.fixture_id=${id} ORDER BY g.id`,
    ),
    results: await rows(
      sql`SELECT * FROM match_results WHERE fixture_id=${id}`,
    ),
    resultRevisions: await rows(
      sql`SELECT * FROM result_revisions WHERE fixture_id=${id} ORDER BY revision`,
    ),
    claims: await rows(
      sql`SELECT * FROM result_game_claims WHERE fixture_id=${id} ORDER BY external_game_id`,
    ),
    history: await rows(
      sql`SELECT * FROM result_audit_events WHERE fixture_id=${id} ORDER BY id`,
    ),
    refereeSessions: await rows(
      sql`SELECT * FROM referee_sessions WHERE fixture_id=${id}`,
    ),
    refereeEvents: await rows(
      sql`SELECT * FROM referee_events WHERE fixture_id=${id} ORDER BY ordinal`,
    ),
    reconciliations: await rows(
      sql`SELECT * FROM referee_reconciliations WHERE fixture_id=${id} ORDER BY revision`,
    ),
    connections: await rows(
      sql`SELECT * FROM referee_irc_connections WHERE fixture_id=${id} ORDER BY id`,
    ),
    commands: await rows(
      sql`SELECT * FROM referee_irc_commands WHERE fixture_id=${id} ORDER BY id`,
    ),
    referees: await rows(
      sql`SELECT * FROM fixture_referees WHERE fixture_id=${id} ORDER BY user_id`,
    ),
    commentators: await rows(
      sql`SELECT * FROM fixture_commentators WHERE fixture_id=${id} ORDER BY user_id`,
    ),
    streams: await rows(
      sql`SELECT * FROM fixture_streams WHERE fixture_id=${id}`,
    ),
    statistics: await rows(
      sql`SELECT * FROM historical_statistics WHERE fixture_id=${id} AND edition_slug=${slug} ORDER BY mp_id`,
    ),
    dependents: await rows(
      sql`SELECT id,version FROM fixtures WHERE home_source_id=${id} OR away_source_id=${id} ORDER BY id`,
    ),
  };
  const blocker = fixtureForceDeleteBlocker(snapshot);
  const counts = Object.fromEntries(
    [
      "imports",
      "games",
      "results",
      "resultRevisions",
      "refereeSessions",
      "refereeEvents",
      "reconciliations",
      "connections",
      "commands",
      "referees",
      "streams",
      "commentators",
      "statistics",
    ].map((key) => [
      key,
      snapshot[key as keyof typeof snapshot] instanceof Array
        ? (snapshot[key as keyof typeof snapshot] as Row[]).length
        : 0,
    ]),
  ) as FixtureForceDeletePreview["counts"];
  // A heartbeat alone is not a new command or record requiring reconfirmation.
  const fingerprintData = {
    ...snapshot,
    connections: snapshot.connections.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(
          ([key]) => !["last_seen_at", "sequence"].includes(key),
        ),
      ),
    ),
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintData))
    .digest("hex");
  const preview: FixtureForceDeletePreview = {
    fixtureId: id,
    label: fixture.label,
    version: fixture.version,
    assignmentRevision: fixture.assignmentRevision,
    fingerprint,
    blocker,
    counts,
  };
  return { snapshot, preview };
}

/** Admin confirmation preflight. POSTed through the existing local mutation channel; never a saved-read capability. */
export async function previewFixtureForceDelete(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_fixtures", slug);
  const command = z
    .object({ action: z.literal("preview_force_delete"), fixtureId: z.uuid() })
    .strict()
    .safeParse(input);
  if (!command.success)
    throw new HttpError(400, "Choose a valid fixture for force deletion.");
  return db().transaction(
    async (tx) => {
      await assertCapability(actor, "manage_fixtures", slug, tx);
      await assertOperationalEdition(slug, tx);
      const [fixture] = await tx
        .select()
        .from(fixtures)
        .where(
          and(
            eq(fixtures.id, command.data.fixtureId),
            eq(fixtures.editionSlug, slug),
          ),
        );
      if (!fixture) throw new HttpError(404, "Fixture not found.");
      return (await fixtureDeletionSnapshot(tx, fixture)).preview;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Called after referee advisory + edition + fixture locks, before deleting the fixture itself. */
export async function forceDeleteFixtureRecords(
  tx: Tx,
  fixture: Fixture,
  expectedFingerprint: string,
) {
  const data = await fixtureDeletionSnapshot(tx, fixture);
  if (data.preview.blocker)
    throw new HttpError(
      409,
      forceDeleteBlockerMessage((message) => message, data.preview.blocker),
    );
  if (data.preview.fingerprint !== expectedFingerprint)
    throw new HttpError(
      409,
      "Fixture records changed. Reload the deletion preview before confirming.",
    );
  const id = fixture.id,
    slug = fixture.editionSlug;
  // FK order is explicit. No cascade crosses into shared data or credentials.
  await tx.execute(
    sql`DELETE FROM referee_irc_commands WHERE fixture_id=${id}`,
  );
  await tx.execute(
    sql`DELETE FROM referee_irc_connections WHERE fixture_id=${id}`,
  );
  await tx.execute(
    sql`DELETE FROM referee_reconciliations WHERE fixture_id=${id}`,
  );
  await tx.execute(sql`DELETE FROM referee_events WHERE fixture_id=${id}`);
  await tx.execute(sql`DELETE FROM referee_sessions WHERE fixture_id=${id}`);
  await tx.execute(sql`DELETE FROM result_revisions WHERE fixture_id=${id}`);
  await tx.execute(sql`DELETE FROM match_results WHERE fixture_id=${id}`);
  await tx.execute(
    sql`DELETE FROM match_games WHERE import_id IN (SELECT id FROM match_imports WHERE fixture_id=${id})`,
  );
  await tx.execute(sql`DELETE FROM match_imports WHERE fixture_id=${id}`);
  await tx.execute(sql`DELETE FROM fixture_streams WHERE fixture_id=${id}`);
  await tx.execute(
    sql`DELETE FROM fixture_commentators WHERE fixture_id=${id}`,
  );
  await tx.execute(
    sql`DELETE FROM historical_statistics WHERE fixture_id=${id} AND edition_slug=${slug}`,
  );
  return data;
}
