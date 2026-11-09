import { db } from "@/db";
import { readHistoricalStatistics } from "./archive-relations";
import { supportsArchiveStatistics } from "./archive-statistics-model";
import { HttpError } from "./http-error";
import { parseStatisticsSnapshot } from "./statistics-snapshot";
import { readTournament } from "./tournament-reads";

type Reader = Pick<ReturnType<typeof db>, "select">;

export async function readStatisticsArchive(
  slug: string,
  reader: Reader = db(),
  publicOnly = false,
) {
  const t = await readTournament(slug, reader, publicOnly);
  if (!supportsArchiveStatistics(slug) || !t?.edition.archive)
    throw new HttpError(404, "Historical statistics are unavailable.");
  return t.edition.archive;
}
export async function readStatisticsSources(slug: string, reader: Reader = db(), fixtureId?: string) {
  const rows = await readHistoricalStatistics(slug, reader, fixtureId);
  return rows.map((r) => ({
    ...r,
    draft: parseStatisticsSnapshot(r.draft),
    published: r.published ? parseStatisticsSnapshot(r.published) : null,
  }));
}
