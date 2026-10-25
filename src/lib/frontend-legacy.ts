/** Compatibility projections for existing core read URLs in remote development. */
import {
  frontendTournaments,
  frontendTournament,
  frontendPlayers,
} from "./frontend-data";
import type { PublicTournament } from "./read-api-contract";
import { publicPlayerFilters } from "./players";
import { RemoteDataError } from "./remote-errors";
export function legacyTournamentProjection(edition: PublicTournament) {
  const {
    slug,
    name,
    season,
    summary,
    status,
    timeZone,
    branding,
    rules,
    eligibility,
    automaticEligibility,
    rankGraceRange,
    schedule,
    registration,
  } = edition;
  return {
    slug,
    name,
    season,
    summary,
    status,
    timeZone,
    branding,
    rules,
    eligibility,
    automaticEligibility,
    rankGraceRange,
    schedule,
    registration,
  };
}
export async function frontendLegacyTournaments() {
  const summaries = await frontendTournaments();
  // This legacy resource embeds every rulebook. Prefer the bounded v1 summaries.
  if (summaries.length > 50)
    throw new RemoteDataError("REMOTE_UNSUPPORTED", 413);
  const result = [];
  for (const summary of summaries)
    result.push(
      legacyTournamentProjection(await frontendTournament(summary.slug)),
    );
  return result;
}
export async function frontendLegacyPlayers(input: unknown) {
  const filters = publicPlayerFilters(input);
  const { rows } = await frontendPlayers(filters.edition!, filters.q);
  return { rows, total: rows.length, filters };
}
