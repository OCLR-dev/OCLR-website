import { createHash } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { mappools, mappoolEntries } from "@/db/schema";
import { getPublicEditions } from "./content";
import { readTournament } from "./tournaments";
import { HttpError } from "./http-error";
import { remoteMode } from "./data-source";
import { slotLabel, type MappoolCategory } from "./mappool-model";
import { compareTournamentSeasons } from "./tournament-order";
import type { Edition } from "./editions";

export type { HistoricalMapSource } from "./competition-detail-read-contracts";
export type HistoricalPoolChoice = {
  editionSlug: string;
  editionName: string;
  poolId: string;
  poolName: string;
  fingerprint: string;
  maps: {
    key: string;
    slot: string;
    category: MappoolCategory;
    beatmapId: number;
    title: string;
  }[];
};
type Reader = Pick<ReturnType<typeof db>, "select">;
function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function archiveChoices(edition: Edition): HistoricalPoolChoice[] {
  return (edition.archive?.pools ?? []).map((pool) => ({
    editionSlug: edition.slug,
    editionName: edition.name,
    poolId: pool.id,
    poolName: pool.name,
    fingerprint: fingerprint(pool),
    maps: pool.maps.flatMap((map) => {
      const category = /^(NM|HD|HR|DT|FM|TB)[1-9]\d?$/.exec(map.slot)?.[1] as
        MappoolCategory | undefined;
      const beatmapId = map.beatmapId ?? map.originalId;
      return category && beatmapId
        ? [
            {
              key: map.slot,
              slot: map.slot,
              category,
              beatmapId,
              title: map.title ?? String(beatmapId),
            },
          ]
        : [];
    }),
  }));
}
async function savedChoices(
  edition: Edition,
  reader: Reader,
): Promise<HistoricalPoolChoice[]> {
  const pools = await reader
    .select()
    .from(mappools)
    .where(
      and(
        eq(mappools.editionSlug, edition.slug),
        isNotNull(mappools.publishedAt),
      ),
    )
    .orderBy(mappools.id);
  const choices: HistoricalPoolChoice[] = [];
  for (const pool of pools) {
    const entries = await reader
      .select()
      .from(mappoolEntries)
      .where(eq(mappoolEntries.poolId, pool.id))
      .orderBy(mappoolEntries.category, mappoolEntries.position);
    choices.push({
      editionSlug: edition.slug,
      editionName: edition.name,
      poolId: pool.id,
      poolName: pool.name,
      fingerprint: fingerprint([pool.version, entries]),
      maps: entries.map((entry) => ({
        key: entry.id,
        slot: slotLabel(entry.category, entry.position),
        category: entry.category,
        beatmapId: entry.beatmapId,
        title: `${entry.metadata.artist} — ${entry.metadata.title} [${entry.metadata.difficulty}]`,
      })),
    });
  }
  return choices;
}
/** Public historical pools only. No provider lookup, replay, or private edition data. */
export async function historicalPoolChoices(slug: string) {
  const editions = (await getPublicEditions())
    .filter(
      (edition) =>
        edition.slug !== slug &&
        (edition.archive || edition.status === "completed"),
    )
    .sort(compareTournamentSeasons);
  const choices: HistoricalPoolChoice[] = [];
  for (const edition of editions) {
    if (edition.archive) choices.push(...archiveChoices(edition));
    else if (!remoteMode())
      choices.push(...(await savedChoices(edition, db())));
    else {
      // Public saved-read composition also works in the read-only remote frontend.
      const { publicMappools } = await import("./mappool-reads");
      for (const pool of await publicMappools(edition.slug)) {
        const entries = pool.entries;
        choices.push({
          editionSlug: edition.slug,
          editionName: edition.name,
          poolId: pool.id,
          poolName: pool.name,
          fingerprint: fingerprint(entries),
          maps: entries.map((e) => ({
            key: e.id,
            slot: slotLabel(e.category, e.position),
            category: e.category,
            beatmapId: e.beatmapId,
            title: `${e.metadata.artist} — ${e.metadata.title} [${e.metadata.difficulty}]`,
          })),
        });
      }
    }
  }
  return choices.filter((pool) => pool.maps.length);
}
/** Re-read publication and source content inside the destination transaction. */
export async function resolveHistoricalPool(
  reader: Reader,
  slug: string,
  selection: {
    sourceEdition: string;
    sourcePool: string;
    sourceFingerprint: string;
    sourceKeys: string[];
  },
) {
  const record = await readTournament(selection.sourceEdition, reader, true);
  const edition = record?.edition;
  if (
    !edition ||
    edition.slug === slug ||
    (!edition.archive && edition.status !== "completed")
  )
    throw new HttpError(404, "Published historical mappool not found.");
  const pools = edition.archive
    ? archiveChoices(edition)
    : await savedChoices(edition, reader);
  const pool = pools.find((p) => p.poolId === selection.sourcePool);
  if (!pool)
    throw new HttpError(404, "Published historical mappool not found.");
  if (pool.fingerprint !== selection.sourceFingerprint)
    throw new HttpError(
      409,
      "The historical mappool changed. Select its maps again.",
    );
  const maps = selection.sourceKeys.map((key) =>
    pool.maps.find((map) => map.key === key),
  );
  if (maps.some((map) => !map))
    throw new HttpError(
      400,
      "Choose maps from the selected historical mappool.",
    );
  return { pool, maps: maps.map((map) => map!) };
}
