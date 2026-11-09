import type { FixtureWorkspace } from "./fixture-reads";
import type { ResolvedBracket, ResolvedSlot } from "./bracket-model";
import { openExhibitionSides } from "./exhibition-sides";
type Fixture = FixtureWorkspace["fixtures"][number];
export function chronologicalFixtures(fixtures: Fixture[]) {
  return [...fixtures].sort(
    (a, b) =>
      (a.scheduledAt?.getTime() ?? Infinity) -
        (b.scheduledAt?.getTime() ?? Infinity) ||
      a.position - b.position ||
      a.label.localeCompare(b.label),
  );
}
export function fixtureSlot(
  data: FixtureWorkspace,
  fixture: Fixture,
  side: "home" | "away",
): ResolvedSlot {
  const sides = openExhibitionSides(
    fixture,
    data.rounds.find((r) => r.round.id === fixture.roundId)?.stage,
  );
  if (sides)
    return {
      teamId: side === "home" ? sides.redId : sides.blueId,
      label: side === "home" ? sides.redName : sides.blueName,
      sourceMatchId: null,
      kind: "team",
    };
  const teamId = side === "home" ? fixture.homeTeamId : fixture.awayTeamId;
  const sourceId =
    side === "home" ? fixture.homeSourceId : fixture.awaySourceId;
  const outcome =
    side === "home" ? fixture.homeSourceOutcome : fixture.awaySourceOutcome;
  const team = data.teams.find((t) => t.id === teamId);
  const source = data.fixtures.find((f) => f.id === sourceId);
  return {
    teamId: team?.id ?? null,
    label:
      team?.name ??
      (source
        ? `${outcome === "loser" ? "Loser" : "Winner"} of ${source.label}`
        : "Team TBD"),
    sourceMatchId: source?.id ?? null,
    kind: source ? (outcome ?? "winner") : team ? "team" : "tba",
  };
}
export function groupedFixtures(data: FixtureWorkspace, roundId: string) {
  const matches = data.fixtures.filter((f) => {
    const round = data.rounds.find((r) => r.round.id === f.roundId);
    return round?.stage === "group" && (!roundId || f.roundId === roundId);
  });
  const groups = data.stages
    .filter((s) => s.kind === "group")
    .flatMap((stage) =>
      (stage.groupConfiguration?.groups ?? []).map((group) => ({
        id: `${stage.id}-${group.key}`,
        name: group.name,
        fixtures: matches.filter(
          (f) =>
            data.rounds.find((r) => r.round.id === f.roundId)?.round.stageId ===
              stage.id &&
            f.homeTeamId !== null &&
            f.awayTeamId !== null &&
            group.teamIds.includes(f.homeTeamId) &&
            group.teamIds.includes(f.awayTeamId),
        ),
      })),
    );
  const assigned = new Set(groups.flatMap((g) => g.fixtures.map((f) => f.id)));
  const unassigned = matches.filter((f) => !assigned.has(f.id));
  if (unassigned.length)
    groups.push({
      id: "unassigned",
      name: "Unassigned group",
      fixtures: unassigned,
    });
  return groups.filter((g) => g.fixtures.length);
}
/** Staff-only layout adapter. Scores remain in the result-review pipeline, never in this view model. */
export function fixtureBracket(
  slug: string,
  data: FixtureWorkspace,
): ResolvedBracket | null {
  const rounds = data.rounds
    .filter((r) => r.stage === "knockout")
    .map(({ round }) => ({
      id: round.id,
      label: round.name,
      matches: data.fixtures
        .filter((f) => f.roundId === round.id)
        .sort((a, b) => a.position - b.position)
        .map((f) => ({
          id: f.id,
          label: f.label,
          status: "pending" as const,
          slots: [
            fixtureSlot(data, f, "home"),
            fixtureSlot(data, f, "away"),
          ] as [ResolvedSlot, ResolvedSlot],
          scores: [null, null] as [null, null],
          winnerSlot: null,
          note: null,
        })),
    }))
    .filter((r) => r.matches.length);
  return rounds.length
    ? {
        editionSlug: slug,
        published: false,
        formatLabel: "Knockout fixtures",
        source: { label: "Authoritative fixtures", url: null },
        updatedAt: data.fixtures
          .map((f) => f.updatedAt.toISOString())
          .sort()
          .at(-1)!,
        groups: [{ id: "knockout", label: "Knockout Stage", rounds }],
      }
    : null;
}
