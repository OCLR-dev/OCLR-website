import { z } from "zod";

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
    formatVersion: z.literal(1),
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
            tier: z.number().int().min(0).max(32).nullable(),
            source,
          })
          .strict(),
      )
      .max(2048),
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
            score: z.tuple([score, score]).nullable(),
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
                    title: text,
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
    for (const p of archive.players) {
      if (p.teamId) team(p.teamId);
      if (p.role === "captain" && (p.tier !== 0 || !p.teamId))
        issue("Captains require a team and Tier 0.");
      if (p.role === "player" && (p.tier === 0 || !p.teamId))
        issue("Players require a team and cannot use Tier 0.");
      if (["coach", "free_agent"].includes(p.role) && p.tier !== null)
        issue("Coaches and free agents have no draft Tier.");
      if (p.role === "free_agent" && p.teamId)
        issue("Free agents cannot have a team.");
    }
    for (const t of archive.teams) {
      if (
        archive.players.filter((p) => p.teamId === t.id && p.role === "captain")
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
    for (const p of archive.players) {
      if (
        p.role === "player" &&
        p.tier !== null &&
        archive.draftMode !== "final-tiers" &&
        !archive.picks.some((pick) => pick.osuId === p.osuId)
      )
        issue("A player Tier requires source draft evidence.");
    }
    for (const m of archive.matches) {
      team(m.teamA);
      team(m.teamB);
      if (m.teamA === m.teamB) issue("A match requires two different teams.");
      if (m.score && m.score[0] === m.score[1])
        issue("Completed historical matches cannot have tied scores.");
      if (m.forfeitWinner !== undefined && m.score !== null)
        issue("Forfeits cannot invent a played map score.");
    }
    for (const s of archive.standings) team(s.teamId);
    for (const p of archive.pools)
      unique(
        p.maps.map((m) => m.slot),
        "pool slot",
      );
  })
  .transform((archive, ctx) => {
    if (archive.editionSlug !== "s10") return archive;
    return {
      ...archive,
      pools: archive.pools.map((pool, index) => {
        const separator = pool.name.indexOf("//");
        if (separator === -1) return pool;
        const name = pool.name.slice(0, separator).trim();
        if (!name)
          ctx.addIssue({
            code: "custom",
            path: ["pools", index, "name"],
            message: "Add a pool name before //.",
          });
        return { ...pool, name };
      }),
    };
  });
export type HistoricalArchive = z.infer<typeof historicalArchiveSchema>;

export function recordedArchiveMatch(m: HistoricalArchive["matches"][number]) {
  return m.score !== null || m.forfeitWinner !== undefined;
}

export function archiveWinner(m: HistoricalArchive["matches"][number]) {
  return (
    m.forfeitWinner ?? (m.score ? (m.score[0] > m.score[1] ? 0 : 1) : null)
  );
}

export function archiveCounts(a: HistoricalArchive) {
  return {
    teams: a.teams.length,
    players: a.players.length,
    picks: a.picks.length,
    results: a.matches.filter(recordedArchiveMatch).length,
    incomplete: a.matches.filter((m) => !recordedArchiveMatch(m)).length,
    pools: a.pools.length,
    maps: a.pools.reduce((n, p) => n + p.maps.length, 0),
  };
}
