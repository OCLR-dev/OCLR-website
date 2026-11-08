import { z } from "zod";
import { profileSnapshotReadContract } from "./profile-read-contract";

const text = z.string();
const number = z.number();
const flag = z.boolean();
const nullableString = z.union([z.null(), text]);
const nullableNumber = z.union([z.null(), number]);
function literals<const Values extends readonly string[]>(values: Values) {
  return z.union(values.map((value: Values[number]) => z.literal(value)));
}
const identity = z.strictObject({ osuId: number, username: text });
const side = z.strictObject({
  name: nullableString,
  source: nullableString,
  outcome: z.union([z.null(), z.literal("winner"), z.literal("loser")]),
});
const fixtureLabel = z.strictObject({ id: text, label: text });
const assignment = {
  userId: number,
  username: text,
  source: literals(["staff", "self"]),
  assignedBy: number,
  assignedByName: text,
  assignedAt: text,
  eligible: flag,
  needsConfirmation: flag,
};
const revisionLink = {
  attemptId: text,
  importId: nullableString,
  gameId: nullableNumber,
  sessionRevision: number,
};

export const operationsReadContracts = {
  streamingWorkspace: z.strictObject({
    actorId: number,
    canManage: flag,
    canSelect: flag,
    canSelectCommentary: flag,
    commentaryCandidates: z.array(identity),
    operational: flag,
    candidates: z.array(identity),
    filters: z.strictObject({
      date: text,
      round: text,
      view: literals(["all", "unassigned", "mine"]),
    }),
    rounds: z.array(z.strictObject({ id: text, name: text })),
    fixtures: z.array(
      z.strictObject({
        ...fixtureLabel.shape,
        roundId: text,
        roundName: text,
        scheduledAt: nullableString,
        timeZone: text,
        status: literals(["scheduled", "in_progress", "cancelled"]),
        completed: flag,
        version: number,
        streamRevision: number,
        home: side,
        away: side,
        conflicts: z.array(fixtureLabel),
        sameStartBookings: z.array(
          z.strictObject({ userId: number, label: text }),
        ),
        assignment: z.union([z.null(), z.strictObject(assignment)]),
        commentators: z.array(
          z.strictObject({ conflicts: z.array(fixtureLabel), ...assignment }),
        ),
      }),
    ),
    history: z.array(
      z.strictObject({
        createdAt: text,
        id: text,
        actorId: nullableNumber,
        detail: z.record(text, z.unknown()),
      }),
    ),
  }),
  refereeReconciliation: z.strictObject({
    fixtureId: text,
    canRecord: flag,
    teams: z.array(
      z.strictObject({
        id: text,
        name: text,
        captainId: nullableNumber,
        captainUsername: nullableString,
        members: z.array(identity),
      }),
    ),
    sessionRevision: number,
    dependencyFingerprint: text,
    revision: number,
    rows: z.array(
      z.strictObject({
        attemptId: text,
        pickId: text,
        pickTeamId: nullableString,
        beatmapId: number,
        category: text,
        attemptNumber: number,
        attemptStatus: literals([
          "pending",
          "tied",
          "completed",
          "aborted",
          "playing",
        ]),
        winnerTeamId: nullableString,
        link: z.union([
          z.null(),
          z.strictObject({
            attemptId: revisionLink.attemptId,
            importId: revisionLink.importId,
            sourceFingerprint: nullableString,
            gameId: revisionLink.gameId,
            sessionRevision: revisionLink.sessionRevision,
            dependencyFingerprint: text,
          }),
        ]),
        sourceWinnerTeamId: nullableString,
        status: literals([
          "stale",
          "matched",
          "missing",
          "unmatched",
          "incomplete",
          "different_map",
          "different_result",
        ]),
      }),
    ),
    sources: z.array(
      z.strictObject({
        importId: text,
        fingerprint: text,
        matchId: number,
        complete: flag,
        current: flag,
        games: z.array(
          z.strictObject({
            id: number,
            beatmapId: nullableNumber,
            winnerTeamId: nullableString,
            tied: flag,
            ended: flag,
            problems: z.array(text),
          }),
        ),
      }),
    ),
    ledgerScore: z.record(text, number),
    official: z.union([
      z.null(),
      z.strictObject({
        revision: number,
        state: literals(["approved", "draft", "submitted"]).optional(),
        series: z.union([
          z.null(),
          z.strictObject({
            homeWins: number,
            awayWins: number,
            tiedMaps: number,
            includedGames: number,
            winnerTeamId: nullableString,
            draw: flag,
            complete: z.literal(true),
          }),
        ]),
        publishedRevision: nullableNumber,
      }),
    ]),
    history: z.array(
      z.strictObject({
        id: text,
        revision: number,
        actorId: number,
        ...revisionLink,
        createdAt: z.date(),
      }),
    ),
  }),
  staffBws: z.strictObject({
    snapshot: profileSnapshotReadContract,
    fingerprint: text,
    version: number,
    classifications: z.array(literals(["unknown", "osu", "other"])),
    summary: z.strictObject({
      mode: literals(["osu", "taiko", "fruits", "mania"]),
      status: literals(["pending", "ready", "stale", "unranked"]),
      value: nullableNumber,
      rawPp: nullableNumber,
      adjustedPp: nullableNumber,
      ppStatus: literals(["pending", "unavailable", "ready", "stale"]),
      stale: flag,
      badgeCount: nullableNumber,
      globalRank: nullableNumber,
      reviewedAt: nullableString,
      fetchedAt: text,
    }),
  }),
} as const;
