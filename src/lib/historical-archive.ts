import { z } from "zod";
import {
  unresolvedArchivePlayer,
  archiveReplacement,
  archiveMatchReview,
  archiveQualifier,
  archiveReviewTable,
  archiveSourceFact,
} from "./historical-source-details";

const text = z.string().trim().min(1).max(300);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const id = z.number().int().positive().max(2147483647);
const source = z.string().trim().min(1).max(160);
const url = z
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" && !parsed.username && !parsed.password
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS source URL without credentials.");
const score = z.number().int().min(0).max(100);
const metric = z.number().finite().nonnegative().max(10000).nullable();

/** Historical evidence is not a registration, OAuth account or live result approval. */
export const historicalArchiveSchema = z
  .object({
    formatVersion: z.union([z.literal(1), z.literal(2)]),
    editionSlug: key,
    sourceUrl: url,
    capturedOn: z.iso.date(),
    notes: z.array(z.string().trim().min(1).max(2000)).max(30),
    links: z.array(z.object({ label: text, url }).strict()).max(30),
    teams: z
      .array(z.object({ id: key, name: text, source }).strict())
      .min(1)
      .max(128),
    players: z
      .array(
        z
          .object({
            osuId: id,
            username: text,
            teamId: key.nullable(),
            role: z.enum(["captain", "player", "coach", "free_agent"]),
            sourceRole: z.literal("VICE").optional(),
            tier: z.number().int().min(0).max(32).nullable(),
            source,
          })
          .strict(),
      )
      .max(2048),
    unresolvedPlayers: z.array(unresolvedArchivePlayer).max(2048).optional(),
    rosterReplacements: z.array(archiveReplacement).max(200).optional(),
    qualifiers: z.array(archiveQualifier).max(32).optional(),
    reviewTables: z.array(archiveReviewTable).max(10).optional(),
    sourceFacts: z.array(archiveSourceFact).max(100).optional(),
    picks: z
      .array(
        z
          .object({
            round: id.max(32),
            pick: id.max(128),
            teamId: key,
            osuId: id,
            source,
          })
          .strict(),
      )
      .max(2048),
    // Some editions preserve final Tiers but no chronological selection log.
    draftMode: z.literal("final-tiers").optional(),
    staff: z
      .array(
        z
          .object({
            osuId: id.nullable(),
            username: text,
            position: text,
            source,
          })
          .strict(),
      )
      .max(200),
    standings: z
      .array(
        z
          .object({
            group: text,
            teamId: key,
            rank: id.max(128).nullable(),
            wins: score,
            losses: score,
            mapsWon: score,
            mapsLost: score,
            source,
          })
          .strict(),
      )
      .max(128),
    matches: z
      .array(
        z
          .object({
            id: key,
            label: text,
            stage: text,
            poolId: key.nullable().optional(),
            teamA: key,
            teamB: key,
            scheduledAt: z.iso.datetime({ offset: true }).nullable(),
            roomOpenedAt: z.iso.datetime({ offset: true }).optional(),
            score: z.tuple([score, score]).nullable(),
            review: archiveMatchReview.optional(),
            forfeitWinner: z.union([z.literal(0), z.literal(1)]).optional(),
            mpUrls: z
              .array(
                url.refine((value) =>
                  /^https:\/\/osu\.ppy\.sh\/(?:community\/matches|mp)\/[1-9]\d*$/.test(
                    value,
                  ),
                ),
              )
              .max(10),
            vodUrl: url.nullable(),
            referee: text.nullable(),
            streamer: text.nullable(),
            commentators: text.nullable(),
            bansA: text.nullable(),
            bansB: text.nullable(),
            source,
          })
          .strict(),
      )
      .max(1024),
    pools: z
      .array(
        z
          .object({
            id: key,
            name: text,
            source,
            maps: z
              .array(
                z
                  .object({
                    slot: z.string().regex(/^(NM|HD|HR|DT|FM|TB|ACE)[1-9]\d?$/),
                    beatmapId: id.nullable(),
                    title: text.nullable(),
                    mapper: text.nullable(),
                    stars: metric,
                    bpm: metric,
                    drainSeconds: metric,
                    cs: metric,
                    ar: metric,
                    od: metric,
                    source,
                  })
                  .strict(),
              )
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .max(32),
  })
  .strict()
  .superRefine((archive, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const unique = (values: (string | number)[], label: string) => {
      if (new Set(values).size !== values.length) issue(`Duplicate ${label}.`);
    };
    if (
      archive.formatVersion === 1 &&
      (archive.unresolvedPlayers !== undefined ||
        archive.rosterReplacements !== undefined ||
        archive.qualifiers !== undefined ||
        archive.reviewTables !== undefined ||
        archive.sourceFacts !== undefined ||
        archive.players.some((p) => p.sourceRole !== undefined) ||
        archive.matches.some(
          (m) => m.review !== undefined || m.roomOpenedAt !== undefined,
        ) ||
        archive.pools.some((p) => p.maps.some((m) => m.title === null)))
    )
      issue(
        "Source-only extensions and unknown titles require archive format version 2.",
      );
    unique(
      archive.teams.map((t) => t.id),
      "team ID",
    );
    unique(
      archive.players.map((p) => p.osuId),
      "player ID",
    );
    unique(
      archive.matches.map((m) => m.id),
      "match ID",
    );
    unique(
      archive.matches.flatMap((m) =>
        m.mpUrls.map((url) => url.split("/").at(-1)!),
      ),
      "MP match",
    );
    unique(
      archive.pools.map((p) => p.id),
      "pool ID",
    );
    unique(
      archive.picks.map((p) => p.osuId),
      "drafted player",
    );
    unique(
      archive.picks.map((p) => `${p.round}:${p.pick}`),
      "draft position",
    );
    unique(
      archive.picks.map((p) => `${p.round}:${p.teamId}`),
      "team draft round",
    );
    if (archive.draftMode === "final-tiers" && archive.picks.length)
      issue("Final Tier allocations cannot claim chronological draft picks.");
    unique(
      archive.standings.map((s) => s.teamId),
      "standing team",
    );
    for (const match of archive.matches) {
      if (
        match.poolId &&
        !archive.pools.some((pool) => pool.id === match.poolId)
      )
        issue("Unknown match pool reference.");
    }
    const teams = new Set(archive.teams.map((t) => t.id));
    const team = (id: string) => {
      if (!teams.has(id)) issue("Unknown team reference.");
    };
    unique(
      (archive.unresolvedPlayers ?? []).map((p) => p.id),
      "unresolved player ID",
    );
    unique(
      (archive.rosterReplacements ?? []).map((p) => p.id),
      "replacement ID",
    );
    const roster = [...archive.players, ...(archive.unresolvedPlayers ?? [])];
    for (const p of roster) {
      if (p.teamId) team(p.teamId);
      if (p.role === "captain" && (p.tier !== 0 || !p.teamId))
        issue("Captains require a team and Tier 0.");
      if (p.role === "player" && (p.tier === 0 || !p.teamId))
        issue("Players require a team and cannot use Tier 0.");
      if (["coach", "free_agent"].includes(p.role) && p.tier !== null)
        issue("Coaches and free agents have no draft Tier.");
      if (p.role === "free_agent" && p.teamId)
        issue("Free agents cannot have a team.");
      if (p.sourceRole === "VICE" && (p.role !== "player" || p.tier !== null))
        issue("VICE source roles have no inferred draft Tier.");
    }
    for (const t of archive.teams) {
      if (
        roster.filter((p) => p.teamId === t.id && p.role === "captain")
          .length !== 1
      )
        issue("Each team requires exactly one captain.");
    }
    for (const pick of archive.picks) {
      team(pick.teamId);
      const p = archive.players.find((p) => p.osuId === pick.osuId);
      if (
        !p ||
        p.role !== "player" ||
        p.teamId !== pick.teamId ||
        p.tier !== pick.round
      )
        issue("Draft pick does not match the roster and Tier.");
    }
    for (const p of roster) {
      if (
        p.role === "player" &&
        p.tier !== null &&
        archive.draftMode !== "final-tiers" &&
        !("osuId" in p && archive.picks.some((pick) => pick.osuId === p.osuId))
      )
        issue("A player Tier requires source draft evidence.");
    }
    for (const m of archive.matches) {
      team(m.teamA);
      team(m.teamB);
      if (m.teamA === m.teamB) issue("A match requires two different teams.");
      if (m.score && m.score[0] === 0 && m.score[1] === 0)
        issue("Completed historical matches require a played map score.");
      if (m.forfeitWinner !== undefined && m.score !== null)
        issue("Forfeits cannot invent a played map score.");
      if (m.review) {
        if (
          m.review.status === "pending" &&
          (m.score !== null ||
            m.forfeitWinner !== undefined ||
            m.review.approval)
        )
          issue("Pending match reviews cannot claim a recorded result.");
        if (
          m.review.status === "approved" &&
          (!m.review.approval ||
            !m.score ||
            m.forfeitWinner !== undefined ||
            !m.review.workingScore ||
            m.score.some((value, i) => value !== m.review!.workingScore![i]))
        )
          issue(
            "Approved match reviews require approval evidence and the reviewed score.",
          );
        if (
          new Set([m.review.redTeamId, m.review.blueTeamId]).size !== 2 ||
          ![m.teamA, m.teamB].includes(m.review.redTeamId) ||
          ![m.teamA, m.teamB].includes(m.review.blueTeamId)
        )
          issue("Review sides must identify the two match teams.");
        unique(
          m.review.games.map((g) => g.gameId),
          "review game ID",
        );
      }
    }
    for (const r of archive.rosterReplacements ?? []) {
      team(r.teamId);
      const ids = r.people.flatMap((p) => (p.osuId === null ? [] : [p.osuId]));
      unique(ids, "replacement identity");
      if (
        r.replacedAt === null &&
        ids.some((id) => archive.players.some((p) => p.osuId === id))
      )
        issue(
          "Undated replacement identities cannot also claim current roster membership.",
        );
      if (
        r.tier !== null &&
        roster.some(
          (p) =>
            p.teamId === r.teamId && p.role === "player" && p.tier === r.tier,
        )
      )
        issue("Replacement slot conflicts with a current Tier allocation.");
    }
    for (const q of archive.qualifiers ?? []) {
      const pool = archive.pools.find((p) => p.id === q.poolId);
      if (!pool) issue("Unknown qualifier pool reference.");
      for (const r of q.records) {
        unique(
          r.scores.map((s) => s.slot),
          "qualifier score slot",
        );
        if (r.scores.some((s) => !pool?.maps.some((m) => m.slot === s.slot)))
          issue("Unknown qualifier score slot.");
      }
    }
    for (const table of archive.reviewTables ?? []) {
      unique(
        table.rows.map((r) => r.teamId),
        "review table team",
      );
      for (const r of table.rows) team(r.teamId);
    }
    for (const s of archive.standings) team(s.teamId);
    for (const p of archive.pools)
      unique(
        p.maps.map((m) => m.slot),
        "pool slot",
      );
  });
export type HistoricalArchive = z.infer<typeof historicalArchiveSchema>;

/** Approval changes the authoritative score, never the retained provider evidence. */
export function approveArchiveMatches(
  archive: HistoricalArchive,
  matchIds: string[],
  approval: NonNullable<
    NonNullable<HistoricalArchive["matches"][number]["review"]>["approval"]
  >,
): HistoricalArchive {
  const ids = new Set(matchIds);
  if (
    !ids.size ||
    ids.size !== matchIds.length ||
    [...ids].some(
      (id) =>
        !archive.matches.some(
          (m) =>
            m.id === id &&
            m.review?.status === "pending" &&
            m.review.workingScore &&
            m.score === null,
        ),
    )
  )
    throw new Error(
      "Only pending saved match reviews with a score can be approved.",
    );
  return historicalArchiveSchema.parse({
    ...archive,
    matches: archive.matches.map((m) =>
      ids.has(m.id)
        ? {
            ...m,
            stage:
              archive.sourceUrl ===
              "https://github.com/OCLR-dev/OCLR-website/issues/289"
                ? m.stage.replace("（重建待確認）", "（重建）")
                : m.stage,
            score: m.review!.workingScore,
            review: { ...m.review!, status: "approved", approval },
          }
        : m,
    ),
  });
}

/** Organizer evidence for one additional historical substitute. */
export const archiveSubstituteConfirmation = z
  .object({
    osuId: id,
    username: text,
    teamId: key,
    source,
    confirmationSource: source,
  })
  .strict();

/** Append confirmed participation, without guessing draft Tier or replacement. */
export function addArchiveSubstitute(
  archive: HistoricalArchive,
  input: z.infer<typeof archiveSubstituteConfirmation>,
): HistoricalArchive {
  const c = archiveSubstituteConfirmation.parse(input);
  if (
    archive.formatVersion !== 2 ||
    archive.draftMode !== "final-tiers" ||
    !archive.teams.some((t) => t.id === c.teamId) ||
    archive.players.some(
      (p) => p.osuId === c.osuId || p.username === c.username,
    ) ||
    archive.unresolvedPlayers?.some((p) => p.username === c.username) ||
    archive.rosterReplacements?.some((r) =>
      r.people.some((p) => p.osuId === c.osuId),
    )
  )
    throw new Error("Substitute identity is missing or already recorded.");
  return historicalArchiveSchema.parse({
    ...archive,
    players: [
      ...archive.players,
      {
        osuId: c.osuId,
        username: c.username,
        teamId: c.teamId,
        role: "player",
        tier: null,
        source: c.source,
      },
    ],
    sourceFacts: [
      ...(archive.sourceFacts ?? []),
      {
        category: "review",
        label: "Archive substitute confirmation",
        text: `${c.username} (osu! UID ${c.osuId}) confirmed as a legal substitute for ${c.teamId}. Tier and replaced player remain unknown. Original roster source: ${c.source}`,
        source: c.confirmationSource,
      },
    ],
  });
}

/** Resolve one source-only identity without replacing competition history. */
export function resolveArchiveIdentity(
  archive: HistoricalArchive,
  confirmation: { unresolvedId: string; osuId: number; source: string },
): HistoricalArchive {
  const person = archive.unresolvedPlayers?.find(
    (p) => p.id === confirmation.unresolvedId,
  );
  if (
    !person ||
    archive.players.some((p) => p.osuId === confirmation.osuId) ||
    archive.rosterReplacements?.some((r) =>
      r.people.some((p) => p.osuId === confirmation.osuId),
    )
  )
    throw new Error("Identity is missing or already recorded.");
  const { id: unresolvedId, ...identity } = person;
  return historicalArchiveSchema.parse({
    ...archive,
    players: [...archive.players, { ...identity, osuId: confirmation.osuId }],
    unresolvedPlayers: archive.unresolvedPlayers!.filter(
      (p) => p.id !== unresolvedId,
    ),
    sourceFacts: [
      ...(archive.sourceFacts ?? []),
      {
        category: "review",
        label: "Archive identity confirmation",
        text: `${unresolvedId}: ${person.username} → osu! UID ${confirmation.osuId}. Original roster source: ${person.source}`,
        source: confirmation.source,
      },
    ],
  });
}

export function recordedArchiveMatch(m: HistoricalArchive["matches"][number]) {
  return (
    m.review?.status !== "pending" &&
    (m.score !== null || m.forfeitWinner !== undefined)
  );
}

/** Management appendices never leave public page/API read models. */
export function publicHistoricalArchive(
  archive: HistoricalArchive,
): HistoricalArchive {
  if (
    !archive.sourceFacts &&
    !archive.reviewTables &&
    !archive.qualifiers &&
    !archive.matches.some((m) => m.review)
  )
    return archive;
  const {
    sourceFacts: _facts,
    reviewTables: _tables,
    qualifiers: _qualifiers,
    ...publicFields
  } = archive;
  void _facts;
  void _tables;
  void _qualifiers;
  return {
    ...publicFields,
    notes: [],
    matches: archive.matches
      .filter(recordedArchiveMatch)
      .map(({ review, ...match }) => ({
        ...match,
        ...(match.roomOpenedAt || review?.startedAt
          ? { roomOpenedAt: match.roomOpenedAt ?? review!.startedAt! }
          : {}),
      })),
  };
}

export function archiveWinner(m: HistoricalArchive["matches"][number]) {
  if (m.review?.status === "pending") return null;
  return (
    m.forfeitWinner ??
    (m.score && m.score[0] !== m.score[1]
      ? m.score[0] > m.score[1]
        ? 0
        : 1
      : null)
  );
}

export function archiveCounts(a: HistoricalArchive) {
  return {
    teams: a.teams.length,
    players:
      a.players.length +
      (a.unresolvedPlayers?.length ?? 0) +
      (a.rosterReplacements ?? []).reduce((n, r) => n + r.people.length, 0),
    picks: a.picks.length,
    results: a.matches.filter(recordedArchiveMatch).length,
    incomplete: a.matches.filter((m) => !recordedArchiveMatch(m)).length,
    pools: a.pools.length,
    maps: a.pools.reduce((n, p) => n + p.maps.length, 0),
  };
}
