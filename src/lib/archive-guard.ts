import { eq, sql, getTableColumns } from "drizzle-orm";
import type { db } from "@/db";
import { editionState } from "@/db/schema";
import { HttpError } from "./http";
const archivePresent = sql<boolean>`${editionState.configuration}->'archive' IS NOT NULL AND ${editionState.configuration}->'archive' <> 'null'::jsonb`;

/** Live-workspace eligibility needs an archive flag, not its source content. */
export async function editionOperationState(
  slug: string,
  reader: Pick<ReturnType<typeof db>, "select">,
) {
  const [row] = await reader
    .select({
      state: {
        ...getTableColumns(editionState),
        configuration: sql<
          (typeof editionState.$inferSelect)["configuration"]
        >`${editionState.configuration} - 'archive'`,
      },
      hasArchive: archivePresent,
    })
    .from(editionState)
    .where(eq(editionState.slug, slug));
  return row ? { ...row.state, hasArchive: row.hasArchive } : undefined;
}

/** Call under the edition row lock shared with archive import. */
export async function assertOperationalEdition(
  slug: string,
  reader: Pick<ReturnType<typeof db>, "select">,
) {
  const [state] = await reader
    .select({
      configured: sql<boolean>`jsonb_typeof(${editionState.configuration})='object'`,
      archive: archivePresent,
    })
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!state?.configured) throw new HttpError(404, "Tournament not found.");
  if (state.archive)
    throw new HttpError(
      409,
      "Historical archives are edited through the archive importer.",
    );
}
