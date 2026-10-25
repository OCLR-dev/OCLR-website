import defaultBrackets from "@/content/brackets.json" with { type: "json" };
import { readFileSync } from "node:fs";
import type { ResolvedBracket, ResolvedMatch } from "./bracket-model";
import {
  bracketTeamIds,
  bracketsSchema,
  resolveBracket,
} from "./bracket-model";
import { getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { frontendResource } from "./frontend-resource";
import { publicCompetition } from "./public-competition";
import { publishedTeams } from "./teams";
export function getBrackets() {
  const file = process.env.OCLR_BRACKETS_FILE;
  return bracketsSchema.parse(
    file
      ? JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8"))
      : defaultBrackets,
  );
}
async function databasePublicBracket(slug: string) {
  if (!(await getPublicEdition(slug))) return null;
  const competition = await publicCompetition(slug);
  if (competition?.databaseAuthority) {
    const fixtures = competition.fixtures.filter((f) => f.stage === "knockout");
    if (!fixtures.length) return null;
    const rounds = [...new Set(fixtures.map((f) => f.roundId))].map((id) => {
      const matches = fixtures.filter((f) => f.roundId === id);
      return {
        id,
        label: matches[0].roundName,
        matches: matches.map((f): ResolvedMatch => ({
          id: f.id,
          label: f.label,
          status: f.result ? "completed" : "pending",
          slots: [f.home, f.away].map((s) => ({
            teamId: s.team?.id ?? null,
            avatarKey: s.team?.avatarKey ?? null,
            label: s.label,
            sourceMatchId: s.sourceId,
            kind: s.outcome ?? (s.team ? "team" : "tba"),
          })) as ResolvedMatch["slots"],
          scores: f.result
            ? [f.result.homeWins, f.result.awayWins]
            : [null, null],
          winnerSlot: f.result?.winnerTeamId
            ? f.result.winnerTeamId === f.home.team?.id
              ? 0
              : 1
            : null,
          note: f.result?.publicNote
            ? f.result.publicNote.slice(0, 500)
            : f.status === "cancelled"
              ? "Cancelled; no winner assumed."
              : !f.confirmed
                ? "Awaiting fixture confirmation."
                : null,
          detailsUrl: `/tournaments/${slug}/matches/${f.id}`,
        })),
      };
    });
    return {
      editionSlug: slug,
      published: true,
      formatLabel: "Knockout Stage · configured fixture progression",
      source: { label: "Approved published OCLR results", url: null },
      updatedAt: fixtures
        .map((f) => f.updatedAt)
        .sort()
        .at(-1)!,
      groups: [{ id: "knockout", label: "Knockout Stage", rounds }],
    } satisfies ResolvedBracket;
  }
  const bracket = getBrackets().find(
    (b) => b.editionSlug === slug && b.published,
  );
  if (!bracket) return null;
  const teams = (await publishedTeams(slug)).filter(
    (t) => t.finalized && t.members !== null,
  );
  if (bracketTeamIds(bracket).some((id) => !teams.some((t) => t.id === id)))
    return null;
  return resolveBracket(bracket, teams);
}
export async function publicBracket(
  slug: string,
): Promise<Awaited<ReturnType<typeof databasePublicBracket>>> {
  if (remoteMode()) {
    return frontendResource<Awaited<ReturnType<typeof databasePublicBracket>>>(
      "publicBracket",
      { slug },
    );
  }
  return databasePublicBracket(slug);
}
