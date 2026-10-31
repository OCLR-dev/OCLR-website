import { db } from "@/db";
import * as schema from "@/db/schema";
import { and, eq, getTableColumns, is, notInArray, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { User } from "./auth/sessions";
import { assertBusinessWrite, assertCapability } from "./auth/staff";
import { editionSchema, normalizeEditionBranding } from "./editions";
import { HttpError } from "./http";
import { isBlankTournamentDraft } from "./tournament-draft";
import { storedEdition } from "./tournaments";

const command = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    confirmSlug: editionSchema.shape.slug,
    confirmed: z.literal(true),
  })
  .strict();

/** Retire only an unused draft; never delete revisions, audit events or reuse its slug. */
export async function deleteUnusedTournamentDraft(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertBusinessWrite(actor);
  // Creation and deletion belong to global Admins, including inside the transaction.
  await assertCapability(actor, "configure_tournament");
  const parsed = command.safeParse(input);
  if (!parsed.success || parsed.data.confirmSlug !== slug)
    throw new HttpError(400, "Confirm the draft slug before deleting.");
  const c = parsed.data;
  await db().transaction(async (tx) => {
    // Same ordering as staff grants/streaming: prevent a concurrent role assignment.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    const [state] = await tx
      .select()
      .from(schema.editionState)
      .where(eq(schema.editionState.slug, slug))
      .for("update");
    await assertCapability(actor, "configure_tournament", undefined, tx);
    const current = state && storedEdition(state);
    if (!current) throw new HttpError(404, "Tournament not found.");
    if (current.revision !== c.expectedRevision)
      throw new HttpError(
        409,
        "Tournament settings changed. Refresh before saving your changes.",
      );
    const revisions = await tx
      .select()
      .from(schema.editionRevisions)
      .where(eq(schema.editionRevisions.editionSlug, slug))
      .orderBy(schema.editionRevisions.version);
    if (
      state.lockedAt ||
      state.registrationPausedAt ||
      state.poolPublished ||
      state.setupVersion !== 0 ||
      !isBlankTournamentDraft(current.edition) ||
      revisions.length !== current.revision + 1 ||
      revisions.some(({ configuration, version }, index) => {
        const saved = editionSchema.safeParse(
          normalizeEditionBranding({ ...configuration, slug }),
        );
        return (
          version !== index ||
          !saved.success ||
          !isBlankTournamentDraft(saved.data)
        );
      })
    )
      throw new HttpError(
        409,
        "Only unused blank drafts can be deleted. Current and earlier saved content must be empty.",
      );

    // Auto-include new edition-owned tables, including non-FK history projections.
    // Configuration history is retained; any other use blocks deletion.
    for (const candidate of Object.values(schema)) {
      if (
        !is(candidate, PgTable) ||
        candidate === schema.editionRevisions ||
        candidate === schema.editionEvents
      )
        continue;
      const table: PgTable = candidate;
      const columns = getTableColumns(table);
      const column = columns.editionSlug;
      if (!column) continue;
      const rows = await tx
        .select({ slug: column })
        .from(table)
        .where(eq(column, slug))
        .limit(1);
      if (rows.length)
        throw new HttpError(
          409,
          "This draft has tournament data or staff history and cannot be deleted.",
        );
    }
    const used = await tx
      .select({ id: schema.editionEvents.id })
      .from(schema.editionEvents)
      .where(
        and(
          eq(schema.editionEvents.editionSlug, slug),
          notInArray(schema.editionEvents.kind, [
            "tournament_create",
            "tournament_general",
          ]),
        ),
      )
      .limit(1);
    if (used.length)
      throw new HttpError(
        409,
        "This draft has tournament data or staff history and cannot be deleted.",
      );
    // configuration=NULL already means no active edition across public/private readers.
    // The row remains as an audit/slug tombstone. Operational writers share this lock.
    await tx
      .update(schema.editionState)
      .set({
        configuration: null,
        configurationVersion: current.revision + 1,
        configurationUpdatedAt: new Date(),
      })
      .where(eq(schema.editionState.slug, slug));
    await tx.insert(schema.editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "tournament_delete_draft",
      detail: {
        entity: { type: "tournament", id: slug },
        before: {
          configuration: state.configuration,
          revision: current.revision,
        },
        after: { configuration: null, revision: current.revision + 1 },
      },
    });
  });
  return { deleted: true, slug };
}
