import { scoringRulesSchema, type ScoringRules } from "./competition-model";
import type {
  GameDecision,
  GamePreview,
  MatchContext,
  MatchGame,
  MatchImportPreview,
  MatchSource,
  SeriesOutcome,
} from "./match-model";

// Stored source snapshots retain these diagnostics as text. Neither mods nor
// pass flags are needed to sum a verified recorded score.
const exhibitionMetadataProblems = new Set([
  "Game mod data is unavailable.",
  "Player mod data is unavailable.",
  "Player pass/fail state is unavailable.",
  "Provider pass flags conflict.",
]);

function gamePreview(
  game: MatchGame,
  context: MatchContext,
  rules: ScoringRules | null,
  decision: GameDecision | null,
  repeated: boolean,
  exhibitionMp: boolean,
): GamePreview {
  const openExhibition = context.fixture.openExhibition === true;
  const scoringProblems = (problems: string[]) =>
    exhibitionMp
      ? problems.filter((problem) => !exhibitionMetadataProblems.has(problem))
      : problems;
  const problems = [...scoringProblems(game.problems)];
  const warnings: string[] = [];
  const declarations = exhibitionMp
    ? []
    : (context.exDeclarations?.filter((p) => p.beatmapId === game.beatmapId) ??
      []);
  const exMode = declarations.some((p) => p.exMode);
  if (exMode && declarations.some((p) => !p.exMode))
    problems.push(
      "EX declaration is ambiguous for this beatmap. Review the referee selections.",
    );
  const requiredPlayers = exMode
    ? rules?.exPlayersPerTeam
    : rules?.playersPerTeam;
  if (exMode && !requiredPlayers)
    problems.push("EX player count is not configured for this round.");

  const roster = new Map(
    context.teams.flatMap((t) =>
      t.members.map((m) => [m.osuId, t.id] as const),
    ),
  );
  const teamIds = [context.fixture.homeTeamId, context.fixture.awayTeamId];
  const substitutions = new Map<number, { teamId: string; reason: string }>();
  if (openExhibition && decision?.substitutions.length)
    problems.push(
      "Open exhibition sides are determined by the recorded red and blue colors, not substitutions.",
    );
  const teamType = exhibitionMp ? game.teamType : rules?.teamType;
  const allowSubstitutions = exhibitionMp || rules?.allowSubstitutions;
  if (openExhibition && teamType !== "team-vs")
    problems.push(
      exhibitionMp
        ? "Choose a recorded red/blue Team Vs game."
        : "Open exhibitions require red/blue team-versus scoring rules.",
    );
  for (const sub of decision?.substitutions ?? []) {
    if (
      substitutions.has(sub.osuId) ||
      !teamIds.includes(sub.teamId) ||
      !sub.reason.trim() ||
      roster.has(sub.osuId) ||
      !game.scores.some((s) => s.osuId === sub.osuId)
    )
      problems.push(
        "Substitution assignments must identify an observed non-roster player exactly once and one fixture team, with a reason.",
      );
    substitutions.set(sub.osuId, sub);
  }
  if (!rules && !exhibitionMp)
    problems.push("Approved scoring rules are missing or incomplete.");
  if (substitutions.size && !allowSubstitutions)
    problems.push("The approved rules do not permit substitutions.");
  if (!game.endTime)
    problems.push(
      "Incomplete or aborted games cannot count toward the result.",
    );
  if (!game.scores.length)
    problems.push("No player score records are available.");
  if (
    rules &&
    (game.mode !== rules.mode ||
      game.teamType !== rules.teamType ||
      game.scoringType !== rules.scoringType)
  )
    problems.push(
      "Game mode, team mode or scoring type differs from the approved rules.",
    );
  const seen = new Set<number>();
  const slots = new Set<number>();
  const players = game.scores.map((score) => {
    problems.push(...scoringProblems(score.problems));
    if (score.osuId && seen.has(score.osuId))
      problems.push("A player has duplicate scores in this game.");
    if (score.osuId) seen.add(score.osuId);
    if (score.slot !== null && slots.has(score.slot))
      problems.push("A multiplayer slot is duplicated.");
    if (score.slot !== null) slots.add(score.slot);
    const ownTeam = score.osuId ? roster.get(score.osuId) : undefined;
    const sub = score.osuId ? substitutions.get(score.osuId) : undefined;
    const teamId = openExhibition
      ? score.osuId && score.team === "red"
        ? teamIds[0]
        : score.osuId && score.team === "blue"
          ? teamIds[1]
          : null
      : (ownTeam ?? (allowSubstitutions ? sub?.teamId : undefined) ?? null);
    if (!teamId)
      problems.push(
        `Player ${score.osuId ?? "unknown"} has no verified fixture-team attribution.`,
      );
    if (sub && !ownTeam && allowSubstitutions)
      warnings.push(
        `Player ${score.osuId} is explicitly attributed as a substitute; Admin approval is required.`,
      );
    if (score.total === null)
      problems.push("At least one player score is unavailable or ambiguous.");
    if (!exhibitionMp && score.passed === false)
      warnings.push(
        `Failed scores use the configured ${rules?.failedScorePolicy === "zero" ? "zero" : "recorded-score"} policy.`,
      );
    return {
      ...score,
      teamId,
      evidence:
        openExhibition && teamId
          ? ("provider" as const)
          : ownTeam
            ? ("roster" as const)
            : teamId
              ? ("substitution" as const)
              : null,
    };
  });
  const colorTeams = (color: string) =>
    new Set(
      players.filter((p) => p.team === color && p.teamId).map((p) => p.teamId!),
    );
  const blue = colorTeams("blue");
  const red = colorTeams("red");
  if (teamType === "team-vs") {
    if (
      blue.size > 1 ||
      red.size > 1 ||
      (blue.size === 1 && red.size === 1 && [...blue][0] === [...red][0])
    )
      problems.push(
        "Provider colors mix or split the two official teams. Do not infer a valid fixture result from this game.",
      );
    if (players.some((p) => p.team !== "red" && p.team !== "blue"))
      warnings.push(
        "Provider colors are unavailable for some players. Verify the roster-based attribution explicitly.",
      );
  }
  const home = players.filter((p) => p.teamId === teamIds[0]);
  const away = players.filter((p) => p.teamId === teamIds[1]);
  if (exhibitionMp && (!home.length || !away.length))
    problems.push("Recorded scores are required for both sides.");
  if (rules)
    for (const [label, group] of [
      ["Home", home],
      ["Away", away],
    ] as const) {
      if (group.length !== requiredPlayers) {
        if (
          group.length > 0 &&
          group.length < (requiredPlayers ?? 0) &&
          !exMode &&
          rules.allowShortHanded
        )
          warnings.push(
            `${label} team is understrength under the explicitly configured rule.`,
          );
        else
          problems.push(
            `${label} player count does not match the approved rules.`,
          );
      }
    }
  if (!exhibitionMp) {
    if (repeated)
      warnings.push(
        "This beatmap appears more than once. Review warmup, rematch and replay exclusions.",
      );
    const matchingSlots =
      context.pool?.entries.filter((e) => e.beatmapId === game.beatmapId) ?? [];
    const slot =
      matchingSlots.find((e) => e.category === "FM") ?? matchingSlots[0];
    if (matchingSlots.length > 1)
      warnings.push(
        "This beatmap occupies multiple pool slots. Document the played slot and verify its mod policy explicitly.",
      );
    if (context.pool && !slot)
      warnings.push(
        "This beatmap is outside the associated pool. Explain any inclusion override.",
      );
    if (
      slot?.category === "FM" &&
      context.pool?.fmMode === "force_mod" &&
      !context.pool.fmRestrictions.trim()
    )
      problems.push(
        "Force Mod restrictions are unconfirmed; compliance cannot be verified.",
      );
    if (slot?.category === "FM")
      warnings.push(
        `Verify the configured ${context.pool?.fmMode === "force_mod" ? "Force Mod" : "Free Mod"} restrictions against the recorded player mods.`,
      );
  }
  let homeScore: number | null = null;
  let awayScore: number | null = null;
  let winnerTeamId: string | null = null;
  let tied = false;
  if ((rules || exhibitionMp) && !problems.length) {
    const average = rules?.aggregation === "average";
    const total = (group: typeof players) =>
      group.reduce(
        (sum, p) =>
          sum +
          BigInt(
            p.passed === false && rules?.failedScorePolicy === "zero"
              ? 0
              : p.total!,
          ),
        0n,
      );
    const h = total(home);
    const a = total(away);
    if (
      h > BigInt(Number.MAX_SAFE_INTEGER) ||
      a > BigInt(Number.MAX_SAFE_INTEGER)
    )
      problems.push("Team totals exceed the supported exact score range.");
    else {
      homeScore = Number(h) / (average ? home.length : 1);
      awayScore = Number(a) / (average ? away.length : 1);
      const left = average ? h * BigInt(away.length) : h;
      const right = average ? a * BigInt(home.length) : a;
      tied = left === right;
      winnerTeamId = tied ? null : left > right ? teamIds[0] : teamIds[1];
      if (tied && rules?.tiedMapPolicy === "require_replay")
        problems.push(
          "A tied game requires an explicitly reviewed replay; exclude the tied original.",
        );
      if (tied && !exhibitionMp)
        warnings.push("This game is tied. No map winner has been invented.");
    }
  }
  return {
    exMode,
    game,
    players,
    colors: {
      blueTeamId: blue.size === 1 ? [...blue][0] : null,
      redTeamId: red.size === 1 ? [...red][0] : null,
    },
    confidence: players.some((p) => !p.teamId)
      ? "unresolved"
      : openExhibition
        ? "provider"
        : players.some((p) => p.evidence === "substitution")
          ? "manual"
          : "roster",
    homeScore,
    awayScore,
    winnerTeamId,
    tied,
    problems: [...new Set(problems)],
    warnings: [...new Set(warnings)],
    decision,
  };
}
/** Pure scoring: no database, network, clocks, hidden defaults or client-provided winners. */
export function previewMatch(
  source: MatchSource,
  context: MatchContext,
  decisions?: readonly GameDecision[],
  useRoundRules = false,
): MatchImportPreview {
  const blockers: string[] = [];
  const exhibitionMp = context.round.stage === "exhibition" && !useRoundRules;
  const parsed = scoringRulesSchema.safeParse(context.round.scoringRules);
  const rules = !exhibitionMp && parsed.success ? parsed.data : null;
  if (!rules && !exhibitionMp)
    blockers.push(
      "Configure complete organizer-approved scoring rules before submitting.",
    );
  if (!source.complete)
    blockers.push(
      "The complete source history is unavailable. Refresh the import before submitting.",
    );
  if (context.fixture.status === "cancelled")
    blockers.push("Cancelled fixtures cannot receive a scored result.");
  const teamIds = [context.fixture.homeTeamId, context.fixture.awayTeamId];
  if (
    teamIds[0] === teamIds[1] ||
    context.teams.length !== 2 ||
    !teamIds.every((id) => context.teams.some((t) => t.id === id))
  )
    blockers.push("Two distinct official fixture teams are required.");
  const rosterIds = context.teams.flatMap((t) => t.members.map((m) => m.osuId));
  if (new Set(rosterIds).size !== rosterIds.length)
    blockers.push(
      "Official team rosters overlap. Staff must resolve the roster inconsistency.",
    );
  const byGame = new Map((decisions ?? []).map((d) => [d.gameId, d]));
  if (
    !decisions ||
    decisions.length !== source.games.length ||
    byGame.size !== decisions.length ||
    decisions.some((d) => !source.games.some((g) => g.id === d.gameId))
  )
    blockers.push(
      "Explicitly include or exclude every source game exactly once.",
    );
  const games = source.games.map((g) =>
    gamePreview(
      g,
      context,
      rules,
      byGame.get(g.id) ?? null,
      g.beatmapId !== null &&
        source.games.filter((other) => other.beatmapId === g.beatmapId).length >
          1,
      exhibitionMp,
    ),
  );
  const series: SeriesOutcome = {
    homeWins: 0,
    awayWins: 0,
    tiedMaps: 0,
    includedGames: 0,
    winnerTeamId: null,
    draw: false,
    complete: false,
  };
  let firstToReached = false;
  for (const g of games) {
    const decision = g.decision;
    if (!decision) continue;
    if (!decision.included) {
      if (!decision.reason.trim())
        blockers.push(`Game ${g.game.id}: document the exclusion reason.`);
      continue;
    }
    series.includedGames++;
    if (!exhibitionMp && !decision.complianceConfirmed)
      blockers.push(`Game ${g.game.id}: confirm mod and rule compliance.`);
    if (!exhibitionMp && g.warnings.length && !decision.reason.trim())
      blockers.push(
        `Game ${g.game.id}: document the warning or attribution resolution.`,
      );
    if (g.problems.length) {
      blockers.push(`Game ${g.game.id}: ${g.problems.join(" ")}`);
      continue;
    }
    if (firstToReached)
      blockers.push(
        `Game ${g.game.id}: explicitly exclude games after the configured series has finished.`,
      );
    if (g.winnerTeamId === teamIds[0]) series.homeWins++;
    else if (g.winnerTeamId === teamIds[1]) series.awayWins++;
    else if (g.tied) series.tiedMaps++;
    if (
      rules?.series.type === "first_to" &&
      (series.homeWins >= rules.series.wins ||
        series.awayWins >= rules.series.wins)
    )
      firstToReached = true;
  }
  if (exhibitionMp) {
    series.complete = series.includedGames > 0;
  } else if (rules?.series.type === "first_to") {
    series.complete =
      (series.homeWins === rules.series.wins &&
        series.awayWins < rules.series.wins) ||
      (series.awayWins === rules.series.wins &&
        series.homeWins < rules.series.wins);
  } else if (rules?.series.type === "fixed_maps") {
    series.complete =
      series.includedGames === rules.series.count &&
      (series.homeWins !== series.awayWins || rules.series.allowDraw);
    if (series.includedGames > rules.series.count)
      blockers.push(
        "Explicitly exclude extra games beyond the approved fixed-map series.",
      );
  }
  if (!series.complete)
    blockers.push(
      exhibitionMp
        ? "Include at least one completed game."
        : "The reviewed games do not complete the configured series. No match winner is assumed.",
    );
  if (blockers.length) series.complete = false;
  if (series.complete) {
    series.draw = series.homeWins === series.awayWins;
    series.winnerTeamId = series.draw
      ? null
      : series.homeWins > series.awayWins
        ? teamIds[0]
        : teamIds[1];
  }
  return {
    fixtureId: context.fixture.id,
    source: {
      matchId: source.match.id,
      title: source.match.title,
      fingerprint: source.fingerprint,
      complete: source.complete,
      warnings: source.warnings,
    },
    teams: teamIds.map((id) => ({
      id,
      name: context.teams.find((t) => t.id === id)?.name ?? "Unresolved team",
    })),
    games,
    series,
    blockers: [...new Set(blockers)],
    canSubmit: series.complete && !blockers.length,
  };
}
