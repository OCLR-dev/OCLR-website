import {
  archiveWinner,
  recordedArchiveMatch,
  type HistoricalArchive,
} from "./historical-archive";
import type { ResolvedBracket, ResolvedMatch } from "./bracket-model";

/** Edges mean a team's previous recorded appearance, never an invented qualification rule. */
export function archiveBracket(
  archive: HistoricalArchive,
  detailsHref: (id: string) => string,
): ResolvedBracket | null {
  const groups = new Map(archive.standings.map((s) => [s.teamId, s.group]));
  const sorted = [...archive.matches]
    .filter(recordedArchiveMatch)
    .sort(
      (a, b) =>
        (a.roomOpenedAt || a.review?.startedAt || a.scheduledAt
          ? Date.parse(
              (a.roomOpenedAt ?? a.review?.startedAt ?? a.scheduledAt)!,
            )
          : Infinity) -
          (b.roomOpenedAt || b.review?.startedAt || b.scheduledAt
            ? Date.parse(
                (b.roomOpenedAt ?? b.review?.startedAt ?? b.scheduledAt)!,
              )
            : Infinity) || a.id.localeCompare(b.id),
    );
  if (!sorted.length) return null;
  const groupMatches = new Map<string, ResolvedMatch[]>();
  const rounds = new Map<
    string,
    { column: number; label: string; matches: ResolvedMatch[] }
  >();
  const last = new Map<string, { id: string; column: number; at: number }[]>();
  for (const m of sorted) {
    const g =
      archive.sourceUrl ===
        "https://github.com/OCLR-dev/OCLR-website/issues/289" &&
      /^瑞士輪第 \d+ 輪/.test(m.stage)
        ? m.stage
        : groups.get(m.teamA);
    const isGroup =
      g &&
      ((g === m.stage && /^瑞士輪第 \d+ 輪/.test(m.stage)) ||
        (g === groups.get(m.teamB) && /^(?:group(?:\s|$)|GS$)/i.test(m.stage)));
    const startedAt = m.roomOpenedAt ?? m.review?.startedAt ?? m.scheduledAt;
    const at = startedAt ? Date.parse(startedAt) : null;
    const predecessors = [m.teamA, m.teamB].map((team) => {
      if (isGroup || at === null) return null;
      const earlier = (last.get(team) ?? []).filter((p) => p.at < at);
      const latest = earlier.at(-1);
      // Simultaneous source appearances cannot establish a unique predecessor.
      return latest && earlier.filter((p) => p.at === latest.at).length === 1
        ? latest
        : null;
    });
    const column = Math.max(
      0,
      ...predecessors.map((p) => (p ? p.column + 1 : 0)),
    );
    const resolved: ResolvedMatch = {
      id: m.id,
      label: m.label,
      status: "completed",
      scores: m.score ?? [null, null],
      winnerSlot: archiveWinner(m),
      note: null,
      detailsUrl: detailsHref(m.id),
      slots: [m.teamA, m.teamB].map((teamId, i) => ({
        teamId,
        label: archive.teams.find((t) => t.id === teamId)!.name,
        sourceMatchId: predecessors[i]?.id ?? null,
        kind: "team" as const,
      })) as ResolvedMatch["slots"],
    };
    if (isGroup) {
      groupMatches.set(g, [...(groupMatches.get(g) ?? []), resolved]);
    } else {
      // Missing dates do not create edges or chronological ordering claims.
      // Do not merge unrelated upper/lower stages just because their path depth
      // is equal. Depth is only a display order, never a named tournament round.
      const index = column;
      const key = `${index}:${m.stage}`;
      const round = rounds.get(key) ?? {
        column: index,
        label: m.stage,
        matches: [],
      };
      round.matches.push(resolved);
      rounds.set(key, round);
      if (at !== null)
        for (const team of [m.teamA, m.teamB]) {
          last.set(team, [
            ...(last.get(team) ?? []),
            { id: m.id, column: index, at },
          ]);
        }
    }
  }
  return {
    editionSlug: archive.editionSlug,
    published: true,
    formatLabel: "Historical archive",
    source: { label: "Source", url: archive.sourceUrl },
    updatedAt: `${archive.capturedOn}T00:00:00Z`,
    groups: [
      ...(rounds.size
        ? [
            {
              id: "match-path",
              label: "Match path",
              rounds: [...rounds.values()]
                .sort((a, b) => a.column - b.column)
                .map((r, i) => ({
                  matches: r.matches,
                  id: `round-${i}`,
                  label: r.label,
                })),
            },
          ]
        : []),
      ...[...groupMatches]
        .map(([g, matches], i) => ({
          id: `group-${i}`,
          label: g,
          layout: "grid" as const,
          rounds: [
            {
              id: `group-round-${i}`,
              label: sorted.find((m) => m.id === matches[0].id)!.stage,
              matches,
            },
          ],
        }))
        .sort((a, b) =>
          a.label.localeCompare(b.label, "en", { numeric: true }),
        ),
    ],
  };
}
