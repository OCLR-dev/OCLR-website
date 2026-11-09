import { beforeEach, describe, expect, it, vi } from "vitest";
import { osuApi } from "../../src/lib/osu-api";
import { fetchMatchSource } from "../../src/lib/osu-matches";
import { previewMatch } from "../../src/lib/match-scoring";
import {
  gameDecisionSchema,
  type GameDecision,
  type MatchContext,
} from "../../src/lib/match-model";
import {
  syntheticApiGame,
  syntheticEvent,
  syntheticMatchContext,
  syntheticMatchId,
  syntheticPage,
  syntheticScoringRules,
} from "../fixtures/match";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
beforeEach(() => vi.mocked(osuApi).mockReset());
async function sourceOf(games: unknown[]) {
  vi.mocked(osuApi).mockResolvedValue(
    syntheticPage(games.map((g, i) => syntheticEvent(i + 1, g))),
  );
  return fetchMatchSource(syntheticMatchId);
}
function choices(ids: number[]): GameDecision[] {
  return ids.map((gameId) => ({
    gameId,
    included: true,
    reason: "Synthetic explicit review",
    complianceConfirmed: true,
    substitutions: [],
  }));
}
function context(change: Record<string, unknown> = {}): MatchContext {
  return {
    ...structuredClone(syntheticMatchContext),
    round: { scoringRules: { ...syntheticScoringRules, ...change } },
  };
}
describe("fixture-bound candidate scoring and explicit game review", () => {
  it("sums recorded exhibition scores across uneven sides and counts included games without round rules", async () => {
    const uneven = syntheticApiGame(1, 100, 75);
    uneven.scoring_type = "scorev2";
    uneven.scores.splice(1, 1);
    const source = await sourceOf([
      {
        ...uneven,
        mods: null,
        scores: uneven.scores.map((score, index) =>
          index === 0
            ? {
                ...score,
                mods: null,
                passed: undefined,
                match: { ...score.match, pass: undefined },
              }
            : score,
        ),
      },
      syntheticApiGame(2, 75, 75),
    ]);
    source.games[0].scores[1].passed = false;
    const c = context({
      playersPerTeam: 4,
      aggregation: "average",
      failedScorePolicy: "zero",
      series: { type: "first_to", wins: 5 },
    });
    c.round.stage = "exhibition";
    c.fixture.openExhibition = true;
    c.teams = c.teams.map((team) => ({ ...team, members: [] }));
    c.pool = { entries: [], fmMode: "force_mod", fmRestrictions: "" };
    const decisions = choices([1, 2]).map((d) => ({
      ...d,
      reason: "",
      complianceConfirmed: false,
    }));

    const preview = previewMatch(source, c, decisions);
    expect(preview.canSubmit).toBe(true);
    expect(preview.games[0]).toMatchObject({
      homeScore: 150,
      awayScore: 100,
      warnings: [],
    });
    expect(preview.series).toMatchObject({
      homeWins: 1,
      awayWins: 0,
      tiedMaps: 1,
      winnerTeamId: c.fixture.homeTeamId,
    });
    expect(previewMatch(source, c, decisions, true).canSubmit).toBe(false);
    c.round.scoringRules = null;
    expect(previewMatch(source, c, decisions).canSubmit).toBe(true);

    const tieOnly = [
      { ...decisions[0], included: false, reason: "Warmup" },
      decisions[1],
    ];
    expect(previewMatch(source, c, tieOnly).series).toMatchObject({
      complete: true,
      draw: true,
      tiedMaps: 1,
      winnerTeamId: null,
    });
    source.games[0].scores[0].team = null;
    expect(previewMatch(source, c, decisions).canSubmit).toBe(false);
  });
  it("maps open exhibition players by each game's colors, including new players and side switches", async () => {
    const games = [syntheticApiGame(1), syntheticApiGame(2)];
    games[1].scores = games[1].scores.map((s, i) => ({
      ...s,
      user_id: i === 0 ? 800001 : games[0].scores[(i + 2) % 4].user_id,
    }));
    const source = await sourceOf(games);
    const c = context();
    c.fixture.openExhibition = true;
    c.teams = c.teams.map((t) => ({ ...t, members: [] }));
    const preview = previewMatch(source, c, choices([1, 2]));
    expect(preview.blockers).toEqual([]);
    expect(preview.canSubmit).toBe(true);
    expect(preview.series).toMatchObject({
      homeWins: 0,
      awayWins: 2,
      winnerTeamId: c.fixture.awayTeamId,
    });
    expect(preview.games.every((g) => g.confidence === "provider")).toBe(true);
    expect(
      preview.games[0].players.find((p) => p.osuId === 1001),
    ).toMatchObject({ teamId: c.fixture.awayTeamId, evidence: "provider" });
    expect(
      preview.games[1].players.find((p) => p.osuId === 1001),
    ).toMatchObject({ teamId: c.fixture.homeTeamId, evidence: "provider" });
    expect(
      preview.games[1].players.find((p) => p.osuId === 800001),
    ).toMatchObject({ teamId: c.fixture.awayTeamId, evidence: "provider" });
    const official = {
      ...c,
      fixture: { ...c.fixture, openExhibition: undefined },
    };
    expect(previewMatch(source, official, choices([1, 2])).canSubmit).toBe(
      false,
    );
    source.games[0].scores[0].team = null;
    expect(previewMatch(source, c, choices([1, 2])).canSubmit).toBe(false);
    source.games[0].scores[0].team = "blue";
    c.round.scoringRules = {
      ...syntheticScoringRules,
      allowSubstitutions: true,
    };
    const reassigned = choices([1, 2]);
    reassigned[0].substitutions = [
      {
        osuId: 1001,
        teamId: c.fixture.homeTeamId,
        reason: "Attempt to override MP colors",
      },
    ];
    expect(previewMatch(source, c, reassigned).canSubmit).toBe(false);
    c.round.scoringRules = {
      ...syntheticScoringRules,
      teamType: "head-to-head",
    };
    expect(previewMatch(source, c, choices([1, 2])).canSubmit).toBe(false);
  });
  it("uses only saved EX declarations for reduced lineups and rejects ambiguous or unconfigured EX", async () => {
    const game = syntheticApiGame(1);
    game.scores = game.scores.filter((_, i) => i === 0 || i === 2);
    const source = await sourceOf([game]);
    const c = context({
      exPlayersPerTeam: 1,
      series: { type: "first_to", wins: 1 },
    });
    expect(previewMatch(source, c, choices([1])).canSubmit).toBe(false);
    c.exDeclarations = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        beatmapId: 10001,
        exMode: true,
      },
    ];
    const approved = previewMatch(source, c, choices([1]));
    expect(approved.canSubmit).toBe(true);
    expect(approved.games[0].exMode).toBe(true);
    const missing = {
      ...c,
      round: {
        scoringRules: {
          ...syntheticScoringRules,
          series: { type: "first_to", wins: 1 },
        },
      },
    };
    expect(previewMatch(source, missing, choices([1])).canSubmit).toBe(false);
    c.exDeclarations = [
      ...c.exDeclarations,
      {
        id: "00000000-0000-4000-8000-000000000002",
        beatmapId: 10001,
        exMode: false,
      },
    ];
    expect(previewMatch(source, c, choices([1])).canSubmit).toBe(false);
  });
  it("requires substantive explanations only for exclusions and scoring warnings", async () => {
    const source = await sourceOf([
      syntheticApiGame(1),
      syntheticApiGame(2, 100, 200),
      syntheticApiGame(3),
    ]);
    const decisions = choices([1, 2, 3]).map((d) => ({ ...d, reason: "" }));
    expect(previewMatch(source, context(), decisions).canSubmit).toBe(true);
    source.games[0].scores[0].team = null;
    const unresolved = previewMatch(source, context(), decisions);
    expect(unresolved.canSubmit).toBe(false);
    expect(unresolved.blockers).toContain(
      "Game 1: document the warning or attribution resolution.",
    );
    decisions[0].reason =
      "Roster identities resolve the missing provider color.";
    expect(previewMatch(source, context(), decisions).canSubmit).toBe(true);
    decisions[0] = { ...decisions[0], included: false, reason: "" };
    expect(previewMatch(source, context(), decisions).blockers).toContain(
      "Game 1: document the exclusion reason.",
    );
    decisions[0].reason = "Organizer reviewed this synthetic game as a warmup.";
    expect(previewMatch(source, context(), decisions).blockers).not.toContain(
      "Game 1: document the exclusion reason.",
    );
  });

  it("uses stable fixture roster IDs, never lobby-title team names, and requires explicit decisions", async () => {
    const source = await sourceOf([
      syntheticApiGame(1),
      syntheticApiGame(2, 100, 200),
      syntheticApiGame(3),
    ]);
    source.match.title = "Untrusted arbitrary lobby team names";
    const unreviewed = previewMatch(source, context());
    expect(unreviewed.canSubmit).toBe(false);
    expect(unreviewed.series.winnerTeamId).toBeNull();
    const result = previewMatch(source, context(), choices([1, 2, 3]));
    expect(result.canSubmit).toBe(true);
    expect(result.series).toMatchObject({
      homeWins: 2,
      awayWins: 1,
      winnerTeamId: syntheticMatchContext.fixture.homeTeamId,
      complete: true,
    });
    expect(result.teams.map((t) => t.name)).toEqual([
      "Synthetic Home",
      "Synthetic Away",
    ]);
    expect(result.games.every((g) => g.confidence === "roster")).toBe(true);
    expect(
      gameDecisionSchema.safeParse({
        ...choices([1])[0],
        winnerTeamId: syntheticMatchContext.fixture.awayTeamId,
      }).success,
    ).toBe(false);
  });
  it("uses the raw recorded MP Score v2 values without recalculating provider scores", async () => {
    const games = [
      syntheticApiGame(1, 900000, 850000),
      syntheticApiGame(2, 950000, 800000),
    ].map((g) => ({
      ...g,
      scoring_type: "scorev2",
      mods: ["V2"],
      scores: g.scores.map((score) => ({ ...score, mods: ["V2"] })),
    }));
    const source = await sourceOf(games);
    const result = previewMatch(
      source,
      context({ scoringType: "scorev2" }),
      choices([1, 2]),
    );
    expect(result.canSubmit).toBe(true);
    expect(result.games[0]).toMatchObject({
      homeScore: 1800000,
      awayScore: 1700000,
    });
    expect(result.series).toMatchObject({
      homeWins: 2,
      awayWins: 0,
      winnerTeamId: syntheticMatchContext.fixture.homeTeamId,
    });
  });
  it("excludes warmups/rematches/extra games only through explicit reasons, not lobby heuristics", async () => {
    const source = await sourceOf([
      syntheticApiGame(1),
      syntheticApiGame(2, 100, 200),
      syntheticApiGame(3),
      syntheticApiGame(4),
    ]);
    expect(
      previewMatch(source, context(), choices([1, 2, 3, 4])).canSubmit,
    ).toBe(false);
    const selected = choices([1, 2, 3, 4]);
    selected[0] = {
      ...selected[0],
      included: false,
      reason: "Synthetic warmup excluded",
    };
    const result = previewMatch(source, context(), selected);
    expect(result.canSubmit).toBe(true);
    expect(result.series).toMatchObject({
      homeWins: 2,
      awayWins: 1,
      includedGames: 3,
    });
    selected[0].reason = "";
    expect(previewMatch(source, context(), selected).canSubmit).toBe(false);
    expect(
      previewMatch(source, context(), [...selected, selected[1]]).canSubmit,
    ).toBe(false);
  });
  it("does not invent tied-map winners and supports explicitly reviewed replays or configured draws", async () => {
    const tie = syntheticApiGame(1, 100, 100);
    const replay = {
      ...syntheticApiGame(2),
      beatmap_id: tie.beatmap_id,
      beatmap: tie.beatmap,
    };
    const source = await sourceOf([tie, replay, syntheticApiGame(3)]);
    const decisions = choices([1, 2, 3]);
    expect(previewMatch(source, context(), decisions).canSubmit).toBe(false);
    decisions[0] = {
      ...decisions[0],
      included: false,
      reason: "Synthetic tied original, replay follows",
    };
    expect(previewMatch(source, context(), decisions).canSubmit).toBe(true);
    expect(
      previewMatch(source, context(), decisions).games[0].winnerTeamId,
    ).toBeNull();
    const drawn = await sourceOf([
      syntheticApiGame(1),
      syntheticApiGame(2, 100, 200),
      syntheticApiGame(3, 100, 100),
    ]);
    const configured = context({
      series: { type: "fixed_maps", count: 3, allowDraw: true },
      tiedMapPolicy: "count_as_draw",
    });
    expect(
      previewMatch(drawn, configured, choices([1, 2, 3])).series,
    ).toMatchObject({
      complete: true,
      draw: true,
      winnerTeamId: null,
      tiedMaps: 1,
    });
    expect(
      previewMatch(
        drawn,
        context({
          series: { type: "fixed_maps", count: 3, allowDraw: false },
          tiedMapPolicy: "count_as_draw",
        }),
        choices([1, 2, 3]),
      ).canSubmit,
    ).toBe(false);
  });
  it("requires permitted, explicit substitution attribution without modifying the official roster", async () => {
    const game = syntheticApiGame(2);
    game.scores[1].user_id = 3001;
    const source = await sourceOf([syntheticApiGame(1), game]);
    const decisions = choices([1, 2]);
    expect(previewMatch(source, context(), decisions).canSubmit).toBe(false);
    decisions[1].substitutions = [
      {
        osuId: 3001,
        teamId: syntheticMatchContext.fixture.homeTeamId,
        reason: "Synthetic approved replacement evidence",
      },
    ];
    expect(previewMatch(source, context(), decisions).canSubmit).toBe(false);
    const ctx = context({ allowSubstitutions: true });
    const result = previewMatch(source, ctx, decisions);
    expect(result.canSubmit).toBe(true);
    expect(result.games[1].confidence).toBe("manual");
    expect(ctx.teams[0].members.some((m) => m.osuId === 3001)).toBe(false);
    decisions[1].substitutions[0].teamId =
      "00000000-0000-4000-8000-000000000099";
    expect(previewMatch(source, ctx, decisions).canSubmit).toBe(false);
  });
  it("blocks mixed official colors, duplicate players and attempts to reassign known roster members", async () => {
    const mixed = syntheticApiGame(1);
    mixed.scores[1].match.team = "red";
    const source = await sourceOf([mixed, syntheticApiGame(2)]);
    expect(previewMatch(source, context(), choices([1, 2])).canSubmit).toBe(
      false,
    );
    const duplicate = syntheticApiGame(1);
    duplicate.scores[1].user_id = duplicate.scores[0].user_id;
    const dupSource = await sourceOf([duplicate, syntheticApiGame(2)]);
    expect(
      previewMatch(
        dupSource,
        context(),
        choices([1, 2]),
      ).games[0].problems.join(" "),
    ).toContain("duplicate");
    const valid = await sourceOf([syntheticApiGame(1), syntheticApiGame(2)]);
    const choicesWithForgery = choices([1, 2]);
    choicesWithForgery[0].substitutions = [
      {
        osuId: 1001,
        teamId: syntheticMatchContext.fixture.awayTeamId,
        reason: "Synthetic forbidden reassignment",
      },
    ];
    expect(
      previewMatch(
        valid,
        context({ allowSubstitutions: true }),
        choicesWithForgery,
      ).canSubmit,
    ).toBe(false);
  });
  it("does not assume missing players are allowed and compares average scores exactly", async () => {
    const short = syntheticApiGame(2, 300, 100);
    short.scores.splice(1, 1);
    const source = await sourceOf([syntheticApiGame(1), short]);
    expect(previewMatch(source, context(), choices([1, 2])).canSubmit).toBe(
      false,
    );
    expect(
      previewMatch(source, context({ allowShortHanded: true }), choices([1, 2]))
        .canSubmit,
    ).toBe(true);
    const average = syntheticApiGame(1, 1, 1);
    average.scores.pop();
    const avgSource = await sourceOf([average]);
    const result = previewMatch(
      avgSource,
      context({
        aggregation: "average",
        allowShortHanded: true,
        series: { type: "fixed_maps", count: 1, allowDraw: true },
        tiedMapPolicy: "count_as_draw",
      }),
      choices([1]),
    );
    expect(result.canSubmit).toBe(true);
    expect(result.series.draw).toBe(true);
    expect(result.games[0]).toMatchObject({
      homeScore: 1,
      awayScore: 1,
      winnerTeamId: null,
    });
  });
  it("uses an explicit failed-score policy instead of assuming whether a failed score counts", async () => {
    const game = syntheticApiGame(2, 300, 100);
    for (const score of game.scores.slice(0, 2)) {
      score.passed = false;
      score.match.pass = false;
    }
    const source = await sourceOf([syntheticApiGame(1), game]);
    expect(previewMatch(source, context(), choices([1, 2])).canSubmit).toBe(
      true,
    );
    const zero = previewMatch(
      source,
      context({
        failedScorePolicy: "zero",
        series: { type: "fixed_maps", count: 2, allowDraw: true },
      }),
      choices([1, 2]),
    );
    expect(zero.canSubmit).toBe(true);
    expect(zero.games[1].winnerTeamId).toBe(
      syntheticMatchContext.fixture.awayTeamId,
    );
    expect(zero.series.draw).toBe(true);
    expect(
      previewMatch(
        source,
        context({ failedScorePolicy: undefined }),
        choices([1, 2]),
      ).canSubmit,
    ).toBe(false);
  });
  it("blocks incomplete history, incomplete games, unsupported formats and missing rules", async () => {
    const source = await sourceOf([syntheticApiGame(1), syntheticApiGame(2)]);
    const partial = previewMatch(
      { ...source, complete: false },
      context(),
      choices([1, 2]),
    );
    expect(partial.canSubmit).toBe(false);
    expect(partial.series.winnerTeamId).toBeNull();
    expect(
      previewMatch(
        source,
        { ...context(), round: { scoringRules: null } },
        choices([1, 2]),
      ).canSubmit,
    ).toBe(false);
    const ongoing = await sourceOf([
      syntheticApiGame(1),
      { ...syntheticApiGame(2), end_time: null },
    ]);
    expect(previewMatch(ongoing, context(), choices([1, 2])).canSubmit).toBe(
      false,
    );
    const unsupported = await sourceOf([
      syntheticApiGame(1),
      { ...syntheticApiGame(2), scoring_type: "accuracy" },
    ]);
    expect(
      previewMatch(unsupported, context(), choices([1, 2])).canSubmit,
    ).toBe(false);
    expect(
      previewMatch(
        source,
        {
          ...context(),
          fixture: { ...context().fixture, status: "cancelled" },
        },
        choices([1, 2]),
      ).canSubmit,
    ).toBe(false);
  });
  it("requires warning resolutions and rule/mod confirmation; no empty lobby creates a forfeit winner", async () => {
    const source = await sourceOf([syntheticApiGame(1), syntheticApiGame(2)]);
    const decisions = choices([1, 2]);
    decisions[0].complianceConfirmed = false;
    expect(previewMatch(source, context(), decisions).canSubmit).toBe(false);
    const empty = await sourceOf([]);
    expect(previewMatch(empty, context(), []).series.winnerTeamId).toBeNull();
    expect(previewMatch(empty, context(), []).canSubmit).toBe(false);
    const poolContext = {
      ...context(),
      pool: {
        fmMode: "force_mod",
        fmRestrictions: "",
        entries: source.games.map((g) => ({
          beatmapId: g.beatmapId!,
          category: "FM",
        })),
      },
    };
    expect(previewMatch(source, poolContext, choices([1, 2])).canSubmit).toBe(
      false,
    );
    const outside = {
      ...context(),
      pool: { fmMode: null, fmRestrictions: "", entries: [] },
    };
    const unexplained = choices([1, 2]);
    unexplained[0].reason = "";
    expect(previewMatch(source, outside, unexplained).canSubmit).toBe(false);
  });
});
