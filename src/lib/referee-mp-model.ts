import { createHash } from "node:crypto";
import type { RefereeWorkspace } from "./referee";
import type { MatchGame, MatchSource } from "./match-model";
import { previewMatch } from "./match-scoring";
import { refereeCommands } from "./referee-commands";

export type MpIssue = {
  gameId: number | null;
  beatmapId: number | null;
  reason:
    | "replay"
    | "unmatched"
    | "incomplete"
    | "rules"
    | "ambiguous"
    | "source_changed"
    | "dependencies"
    | "already_used";
};
export type MpReceipt = {
  attemptId: string;
  pickId: string;
  gameId: number;
  matchId: number;
  gameHash: string;
  eventId: string | null;
  review: boolean;
};
export const gameHash = (game: MatchGame) =>
  createHash("sha256").update(JSON.stringify(game)).digest("hex");
export function lastAttemptOutcome(w: RefereeWorkspace, attemptId: string) {
  return w.events.findLast(
    (e) =>
      e.payload.type === "attempt_resolved" &&
      e.payload.attemptId === attemptId,
  );
}
/** Only a unique first play of the current recorded selection can be automatic. */
export function planMpResults(
  w: RefereeWorkspace,
  source: MatchSource,
  receipts: MpReceipt[],
  used: Set<number>,
) {
  const issues: MpIssue[] = [];
  const score: {
    pickId: string;
    attemptId: string;
    game: MatchGame;
    winnerTeamId: string;
  }[] = [];
  const invalidate: MpReceipt[] = [];
  const context = {
    fixture: {
      ...w.fixture,
      homeTeamId: w.fixture.homeTeamId!,
      awayTeamId: w.fixture.awayTeamId!,
    },
    round: { scoringRules: w.rules },
    teams: w.teams,
    pool: { fmMode: null, fmRestrictions: "", entries: w.maps },
    exDeclarations: w.projection.activeSelections
      .filter((s) => s.kind !== "ban")
      .map((s) => ({ id: s.id, beatmapId: s.beatmapId, exMode: !!s.exMode })),
  };
  const previews = previewMatch(source, context).games;
  const safeSource = source.complete && !source.warnings.length;
  for (const selection of w.projection.activeSelections.filter(
    (s) => s.kind !== "ban",
  )) {
    const attempt = selection.attempts.at(-1)!;
    const receipt = receipts.find(
      (r) => r.attemptId === attempt.id && r.matchId === source.match.id,
    );
    const outcome = lastAttemptOutcome(w, attempt.id);
    // A human resolution owns its outcome, even when it disagrees with the provider.
    if (outcome && outcome.id !== receipt?.eventId) continue;
    const games = source.games.filter(
      (g) => g.beatmapId === selection.beatmapId,
    );
    let reason: MpIssue["reason"] | null = null;
    const game = games[0];
    const preview = previews.find((p) => p.game.id === game?.id);
    if (selection.attempts.length > 1 || games.length > 1) reason = "replay";
    else if (!game) {
      if (receipt) reason = "source_changed";
      else continue;
    } else if (!safeSource) reason = "incomplete";
    else if (!game.endTime) {
      if (receipt) reason = "source_changed";
      else continue;
    } else if (
      !game.startTime ||
      Date.parse(game.startTime) >= Date.parse(game.endTime) ||
      Date.parse(game.endTime) > Date.parse(source.fetchedAt)
    )
      reason = "incomplete";
    else {
      const pickedAt = w.events.find((e) => e.id === selection.id)?.createdAt;
      const matchingPicks = w.projection.activeSelections.filter(
        (s) => s.kind !== "ban" && s.beatmapId === game.beatmapId,
      );
      if (
        !pickedAt ||
        Date.parse(game.startTime) < Date.parse(pickedAt) ||
        matchingPicks.length !== 1
      )
        reason = "ambiguous";
      else if (
        !preview?.winnerTeamId ||
        preview.problems.length ||
        preview.warnings.length ||
        preview.confidence !== "roster" ||
        game.scores.some((s) => s.passed !== true)
      )
        reason = "rules";
      else {
        const mods = refereeCommands({
          settings: w.defaultSettings,
          policy: w.policy?.commands ?? null,
          rules: w.rules,
          teams: w.teams,
          selectedMap: selection,
        }).find((c) => c.kind === "mods")?.text;
        const expected = mods
          ?.replace("!mp mods ", "")
          .split(" ")
          .filter((m) => m !== "None")
          .sort();
        if (
          !expected ||
          expected.includes("Freemod") ||
          JSON.stringify(expected) !== JSON.stringify([...game.mods].sort()) ||
          game.scores.some(
            (s) =>
              JSON.stringify([...new Set([...game.mods, ...s.mods])].sort()) !==
              JSON.stringify(expected),
          )
        )
          reason = "rules";
      }
    }
    if (
      receipt &&
      (receipt.review ||
        game?.id !== receipt.gameId ||
        gameHash(game) !== receipt.gameHash)
    )
      reason = "source_changed";
    if (reason) {
      issues.push({
        gameId: game?.id ?? receipt?.gameId ?? null,
        beatmapId: selection.beatmapId,
        reason,
      });
      if (receipt && !receipt.review && outcome?.id === receipt.eventId)
        invalidate.push(receipt);
      continue;
    }
    if (
      receipt ||
      !game ||
      !preview?.winnerTeamId ||
      outcome ||
      !["pending", "playing"].includes(attempt.status)
    )
      continue;
    if (used.has(game.id)) {
      issues.push({
        gameId: game.id,
        beatmapId: game.beatmapId,
        reason: "already_used",
      });
      continue;
    }
    if (selection.id !== w.projection.lastSelectionId) continue;
    score.push({
      pickId: selection.id,
      attemptId: attempt.id,
      game,
      winnerTeamId: preview.winnerTeamId,
    });
  }
  for (const game of source.games) {
    if (
      !w.projection.activeSelections.some(
        (s) => s.kind !== "ban" && s.beatmapId === game.beatmapId,
      )
    )
      issues.push({
        gameId: game.id,
        beatmapId: game.beatmapId,
        reason: "unmatched",
      });
  }
  const awaitingReview = receipts.some(
    (r) =>
      r.review &&
      w.projection.activeSelections.some((s) => s.id === r.pickId) &&
      lastAttemptOutcome(w, r.attemptId)?.id === r.eventId,
  );
  return {
    score: awaitingReview || invalidate.length ? [] : score,
    invalidate,
    issues,
  };
}
