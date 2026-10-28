import { editionSchema, type Edition } from "./editions";
import { compareTournamentSeasons } from "./tournament-order";

export const overviewPageSize = 12;
export const overviewTournamentStatuses = editionSchema.shape.status.options;
export type OverviewParams = Record<string, string | string[] | undefined>;
type OverviewTournament = Pick<
  Edition,
  "slug" | "name" | "season" | "status" | "published"
>;

/** Call only with the complete, already-authorized tournamentList rows. */
export function overviewTournaments<T extends OverviewTournament>(
  rows: readonly T[],
  params: OverviewParams,
) {
  const query =
    typeof params.tournamentQuery === "string"
      ? params.tournamentQuery.trim().slice(0, 100)
      : "";
  const status =
    typeof params.tournamentStatus === "string" &&
    overviewTournamentStatuses.some(
      (status) => status === params.tournamentStatus,
    )
      ? params.tournamentStatus
      : "";
  const filtered = rows
    .filter(
      (row) =>
        row.name.toLowerCase().includes(query.toLowerCase()) &&
        (!status || row.status === status),
    )
    .sort(compareTournamentSeasons);
  const pages = Math.max(1, Math.ceil(filtered.length / overviewPageSize));
  const rawPage =
    typeof params.tournamentPage === "string" &&
    /^\d+$/.test(params.tournamentPage)
      ? Number(params.tournamentPage)
      : 1;
  const page = Number.isSafeInteger(rawPage)
    ? Math.max(1, Math.min(rawPage, pages))
    : 1;
  return {
    query,
    status,
    page,
    pages,
    total: filtered.length,
    rows: filtered.slice(
      (page - 1) * overviewPageSize,
      page * overviewPageSize,
    ),
  };
}

export function overviewTournamentHref(
  filters: { query: string; status: string },
  page = 1,
) {
  const query = new URLSearchParams();
  if (filters.query) query.set("tournamentQuery", filters.query);
  if (filters.status) query.set("tournamentStatus", filters.status);
  if (page > 1) query.set("tournamentPage", String(page));
  return `/admin${query.size ? `?${query}` : ""}#accessible-tournaments`;
}
