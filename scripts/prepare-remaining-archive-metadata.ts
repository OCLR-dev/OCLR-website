/** Offline #610 review. Reads explicit local Admin downloads; never contacts a service. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  historicalArchiveSchema,
  type HistoricalArchive,
} from "../src/lib/historical-archive";
import { deriveS8Standings } from "../src/lib/s8-standings";
import { statisticsArchiveKey } from "../src/lib/archive-statistics";
import { editionSchema } from "../src/lib/editions";

type Match = HistoricalArchive["matches"][number];
type Round = NonNullable<Match["round"]>;
const eliminationMatches: Record<string, string[][]> = {
  s4: [["k10"], ["k9"], ["k8"], ["k6", "k7"], ["k3", "k4"]],
  // Organizer confirmed no reset on 2026-11-01, #610 comment 6555006692.
  s6: [
    ["mp-86362224"],
    ["mp-86302764"],
    ["mp-85546490"],
    ["mp-85439390", "mp-85503945"],
    ["mp-84896923", "mp-85044339"],
  ],
  s7: [
    ["match-gf"],
    ["match-lf"],
    ["match-l5"],
    ["match-l3", "match-l4"],
    ["match-l1", "match-l2"],
  ],
  s8: [
    ["match-38"],
    ["match-37"],
    ["match-36"],
    ["match-34", "match-35"],
    ["match-31", "match-32"],
    ["match-27", "match-28", "match-29", "match-30"],
  ],
  s9: [
    ["match-22"],
    ["match-21"],
    ["match-20"],
    ["match-18", "match-19"],
    ["match-14", "match-16"],
  ],
  s10: [
    ["match-30"],
    ["match-29"],
    ["match-28"],
    ["match-25", "match-26"],
    ["match-23", "match-24"],
  ],
};

/** Explicit scored elimination evidence; labels/dates never determine a place. */
export function proposedPlacements(archive: HistoricalArchive) {
  const plan = eliminationMatches[archive.editionSlug];
  if (!plan) return [];
  const teams = new Set(archive.teams.map((t) => t.id));
  const decided = (id: string) => {
    const m = archive.matches.find((m) => m.id === id);
    if (!m?.score || m.score[0] === m.score[1])
      throw new Error(`Missing decided placement evidence: ${id}`);
    const winner = m.score[0] > m.score[1] ? m.teamA : m.teamB;
    const loser = winner === m.teamA ? m.teamB : m.teamA;
    if (!teams.has(winner) || !teams.has(loser))
      throw new Error("Unknown placement team");
    return { winner, loser };
  };
  const champion = decided(plan[0][0]).winner;
  const rows: NonNullable<HistoricalArchive["finalPlacements"]> = [];
  const used = new Set<string>();
  const elimination = new Map<string, string>();
  function add(ids: string[], start: number, evidence: string[]) {
    const end = start + ids.length - 1;
    for (const teamId of ids) {
      if (used.has(teamId))
        throw new Error("A team occupies multiple placement bands");
      used.add(teamId);
      rows.push({
        teamId,
        placement: { start, end },
        scope: "final",
        tied: false,
        official: false,
        note: "Reconstructed from the scored elimination path; bands are not separate tie-break results.",
        source: `#610 reconstruction: ${evidence.join(", ")}`,
      });
    }
  }
  add([champion], 1, [plan[0][0]]);
  let next = 2;
  for (const ids of plan) {
    for (const id of ids) elimination.set(decided(id).loser, id);
    add(
      ids.map((id) => decided(id).loser),
      next,
      ids,
    );
    next += ids.length;
  }
  const tail = [...teams].filter((id) => !used.has(id));
  // The tail must have no knockout appearance, not merely no last-loss entry.
  const knockout = archive.matches.filter(
    (m) => m.score && !groupRound(archive.editionSlug, m),
  );
  if (knockout.length !== (archive.editionSlug === "s8" ? 14 : 10))
    throw new Error("Unexpected knockout series count");
  const playoff = new Set(knockout.flatMap((m) => [m.teamA, m.teamB]));
  const last = new Map<string, Match>();
  const observedTime = (m: Match) =>
    m.scheduledAt ?? m.roomOpenedAt ?? m.review?.startedAt;
  if (knockout.some((m) => !observedTime(m)))
    throw new Error("Undated placement path");
  for (const m of [...knockout].sort(
    (a, b) => Date.parse(observedTime(a)!) - Date.parse(observedTime(b)!),
  ))
    for (const id of [m.teamA, m.teamB]) last.set(id, m);
  for (const id of playoff) {
    const m = last.get(id)!;
    if (id === champion) {
      if (m.id !== plan[0][0] || decided(m.id).winner !== id)
        throw new Error("Champion path is inconsistent");
    } else if (m.id !== elimination.get(id) || decided(m.id).loser !== id)
      throw new Error("Final elimination path is inconsistent");
  }
  if (tail.some((id) => playoff.has(id)))
    throw new Error("Unaccounted knockout participant");
  if (tail.length) add(tail, next, ["group-stage elimination"]);
  return rows;
}

function groupRound(slug: string, match: Match): Round | null {
  const n = Number(match.id.replace(/^match-/, ""));
  if (["s8", "s9", "s10"].includes(slug)) {
    const total = { s8: 24, s9: 12, s10: 20 }[slug]!;
    if (Number.isInteger(n) && n >= 1 && n <= total)
      return { phase: "group", index: 1 };
  }
  if (["s1", "s2", "s3"].includes(slug) && match.id.startsWith("gs-"))
    return { phase: "group", index: 1 };
  if (
    slug === "s7" &&
    /^match-a(?:1|2|4|5|7|8|9|10|13|14|15|16)$/.test(match.id)
  )
    return { phase: "group", index: 1 };
  if (slug === "s4" && /^a\d+$/.test(match.id))
    return { phase: "group", index: Math.ceil(Number(match.id.slice(1)) / 6) };
  if (
    slug === "s5" &&
    /^a\d+$/.test(match.id) &&
    Number(match.id.slice(1)) <= 24
  )
    return { phase: "group", index: Math.ceil(Number(match.id.slice(1)) / 6) };
  if (slug === "s6") {
    // Exact reviewed source stages; the emitted runtime data is typed.
    const index = [1, 2, 3, 4].find(
      (i) => match.stage === `瑞士輪第 ${i} 輪（重建）`,
    );
    if (index) return { phase: "swiss", index };
  }
  return null;
}

const knockoutRounds: Record<string, string[][]> = {
  s1: [
    ["es-ws1", "es-ws2", "es-ls1", "es-ls2"],
    ["es-ls3", "es-ls4"],
    ["es-ws3", "es-ls5"],
    ["es-lf"],
    ["es-gf"],
  ],
  s2: [
    ["es-a1", "es-a2", "es-a3", "es-a4"],
    ["es-a5", "es-a6", "es-a7"],
    ["es-a8"],
    ["es-a9"],
    ["es-a10"],
  ],
  s3: [
    ["ko-a1", "ko-b2", "ko-a3", "ko-b4"],
    ["ko-a5", "ko-b6", "ko-b7"],
    ["ko-b8"],
    ["ko-b9"],
    ["ko-a10"],
  ],
  s4: [["k1", "k2", "k3", "k4"], ["k5", "k6", "k7"], ["k8"], ["k9"], ["k10"]],
  s5: [
    ["a25", "a26", "b27", "b28"],
    ["wf", "b30", "b31"],
    ["b32"],
    ["lf"],
    ["gf"],
  ],
  s6: [
    ["mp-84896923", "mp-84972689", "mp-85044339", "mp-85172398"],
    ["mp-85439390", "mp-85501582", "mp-85503945"],
    ["mp-85546490"],
    ["mp-86302764"],
    ["mp-86362224"],
  ],
  s7: [
    ["match-w1", "match-w2", "match-l1", "match-l2"],
    ["match-w3", "match-l3", "match-l4"],
    ["match-l5"],
    ["match-lf"],
    ["match-gf"],
  ],
  s8: [
    ["match-25", "match-26", "match-27", "match-28", "match-29", "match-30"],
    ["match-31", "match-32"],
    ["match-33", "match-34", "match-35"],
    ["match-36"],
    ["match-37"],
    ["match-38"],
  ],
  s9: [
    ["match-13", "match-14", "match-15", "match-16"],
    ["match-17", "match-18", "match-19"],
    ["match-20", "match-20a", "match-20b", "match-20c", "match-20d"],
    ["match-21"],
    ["match-22", "match-22a", "match-22b"],
  ],
  s10: [
    ["match-21", "match-22", "match-23", "match-24"],
    ["match-25", "match-26", "match-27"],
    ["match-28", "match-28a", "match-28b", "match-28c", "match-28d"],
    ["match-29"],
    ["match-30", "match-30a", "match-30b"],
  ],
};

export function matchMetadata(slug: string, match: Match) {
  let round = groupRound(slug, match);
  if (!round) {
    const groups = knockoutRounds[slug];
    const index = groups?.findIndex((ids) => ids.includes(match.id)) ?? -1;
    if (index < 0) throw new Error(`Unreviewed round: ${slug}/${match.id}`);
    round =
      index === groups.length - 1
        ? { phase: "final", index: 1 }
        : { phase: "knockout", index: index + 1 };
  }
  const group = round.phase === "group" || round.phase === "swiss";
  let format: Match["format"];
  if (group) {
    format =
      slug === "s1"
        ? { bestOf: 7 }
        : slug === "s2"
          ? { maxGames: 8, winsRequired: 5 }
          : ["s3", "s4"].includes(slug)
            ? { maxGames: 10, winsRequired: 6 }
            : { bestOf: ["s5", "s6"].includes(slug) ? 9 : 11 };
  } else {
    const index = round.index;
    if (["s1", "s2"].includes(slug)) format = { bestOf: 11 };
    // S3's last two played scores exceed the rulebook's BO11; retain unknown format.
    else if (slug === "s3")
      format =
        round.phase === "final" || index === 4 ? undefined : { bestOf: 11 };
    else if (slug === "s4")
      format = { bestOf: round.phase === "final" || index === 4 ? 13 : 11 };
    else if (slug === "s5")
      format = { bestOf: ["wf", "lf", "gf"].includes(match.id) ? 13 : 11 };
    else if (slug === "s6") {
      if (match.id !== "mp-85501582")
        format = { bestOf: round.phase === "final" || index === 4 ? 13 : 11 };
      else format = { bestOf: 13 }; // Explicit eleven played games, first to seven, #289 receipt.
    } else if (slug === "s7")
      format = {
        bestOf: ["match-w3", "match-l5", "match-lf", "match-gf"].includes(
          match.id,
        )
          ? 13
          : 11,
      };
    else if (slug === "s8")
      format = { bestOf: index >= 3 || round.phase === "final" ? 13 : 11 };
    else format = { bestOf: index >= 2 || round.phase === "final" ? 13 : 11 };
  }
  return { round, ...(format ? { format } : {}), timeZone: "Asia/Shanghai" };
}

/** Add metadata only; preserve the entire statistics source identity and old facts. */
export function proposeMetadata(before: HistoricalArchive) {
  const after = structuredClone(before);
  after.formatVersion = 2;
  if (after.editionSlug === "s6") {
    const note =
      "2026-11-01 主办者确认 MP 86362224 的 G 5:7 B 为终局，没有 reset；按 #610 审阅口径重建最终名次。原 stage 文字保留来源版本。";
    if (!after.notes.includes(note)) after.notes.push(note);
  }
  for (const match of after.matches) {
    Object.assign(match, matchMetadata(after.editionSlug, match));
    if (after.editionSlug === "s2" && match.id === "gs-a9")
      match.adjudication = {
        kind: "forfeit",
        note: "Original MainSheet records 0:5 and win by default. Preserve that approved result; it supplies no player-game scores.",
        evidenceUrl: after.sourceUrl,
      };
    if (after.editionSlug === "s10" && match.id === "match-26")
      match.adjudication = {
        kind: "technical",
        note: "Retain the existing published technical decision: series 7:6, selected raw-game wins 8:5. The cause is not established; no individual technical points are invented.",
        evidenceUrl: "https://osu.ppy.sh/community/matches/117829761",
      };
    if (after.editionSlug === "s6" && match.id === "mp-84398168")
      match.adjudication = {
        kind: "technical",
        note: "Organizer confirmed D–I 3:5; the final TB was entertainment and is excluded. Original raw 3:6 remains in the review evidence.",
        evidenceUrl: "https://github.com/OCLR-dev/OCLR-website/issues/289",
      };
    if (after.editionSlug === "s6" && match.id === "mp-85503945")
      match.adjudication = {
        kind: "technical",
        note: "Organizer confirmed C–F 2:6 with HD2 awarded to F; visible completed MP games remain 2:5. No missing individual score or end time is fabricated.",
        evidenceUrl: "https://github.com/OCLR-dev/OCLR-website/issues/289",
      };
    if (match.forfeitWinner !== undefined && !match.adjudication)
      match.adjudication = {
        kind: "forfeit",
        note: "Existing approved forfeit; no played-map score is fabricated.",
        evidenceUrl: after.sourceUrl,
      };
    if (!match.score && ["s9", "s10"].includes(after.editionSlug))
      match.adjudication = {
        kind: "not-played",
        note: "Conditional schedule row retained as source evidence; not an additional played series.",
        evidenceUrl: after.sourceUrl,
      };
  }
  if (["s1", "s2", "s3", "s5"].includes(after.editionSlug)) {
    const counts = new Map<number, number>();
    for (const row of after.standings)
      if (row.rank !== null)
        counts.set(row.rank, (counts.get(row.rank) ?? 0) + 1);
    for (const row of after.standings) {
      row.scope = "final";
      if (row.rank === null) {
        if (after.editionSlug !== "s5")
          throw new Error("Previously accepted rank unexpectedly missing");
        row.placement = { start: 9, end: 12 };
        row.tied = false;
      } else {
        row.placement = {
          start: row.rank,
          end: row.rank + counts.get(row.rank)! - 1,
        };
        row.tied = counts.get(row.rank)! > 1;
      }
      row.official = false;
    }
    after.finalPlacements = after.standings.map((row) => ({
      teamId: row.teamId,
      placement: row.placement!,
      scope: "final",
      tied: row.tied,
      official: false,
      source: row.source,
    }));
  } else {
    const advanced = new Set(
      after.matches
        .filter(
          (m) =>
            (m.round?.phase === "knockout" || m.round?.phase === "final") &&
            (m.score !== null || m.forfeitWinner !== undefined),
        )
        .flatMap((m) => [m.teamA, m.teamB]),
    );
    for (const row of after.standings) {
      row.scope = "group";
      if (row.rank !== null) row.placement = { start: row.rank, end: row.rank };
      row.official = row.rank !== null;
      row.qualified = advanced.has(row.teamId);
    }
    if (after.editionSlug === "s8") {
      for (const calculated of deriveS8Standings(before)) {
        if (calculated.status !== "complete" || calculated.rank === null)
          throw new Error("S8 group calculation is not complete");
        const row = after.standings.find(
          (r) => r.teamId === calculated.teamId,
        )!;
        row.placement = { start: calculated.rank, end: calculated.rank };
        row.tied = calculated.tied;
        row.qualified = calculated.rank <= 3;
        row.official = false;
        row.note =
          "Wins then map difference, recomputed from 24 scored matches; accepted under #171. Cached totals remain source evidence.";
      }
    }
    const proposal = proposedPlacements(after);
    if (proposal.length) after.finalPlacements = proposal;
  }
  historicalArchiveSchema.parse(after);
  if (statisticsArchiveKey(before) !== statisticsArchiveKey(after))
    throw new Error("Metadata proposal would invalidate published statistics");
  return after;
}

type RoomSource = {
  mpId: number;
  roomOpenedAt?: string;
  references: { season: string; fixtureId: string }[];
};
/** An observed opening instant cannot supply an unknown scheduled instant. */
export function addVerifiedRoomDates(
  archive: HistoricalArchive,
  sources: RoomSource[],
) {
  const result = structuredClone(archive);
  for (const m of result.matches) {
    if (m.roomOpenedAt !== undefined) continue;
    const dates = sources
      .filter(
        (s) =>
          s.roomOpenedAt &&
          m.mpUrls.some((u) => Number(u.split("/").at(-1)) === s.mpId) &&
          s.references.some(
            (r) => r.season === archive.editionSlug && r.fixtureId === m.id,
          ),
      )
      .map((s) => s.roomOpenedAt!);
    if (dates.length)
      m.roomOpenedAt = dates.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  }
  historicalArchiveSchema.parse(result);
  if (statisticsArchiveKey(archive) !== statisticsArchiveKey(result))
    throw new Error("Room dates changed statistics identity");
  return result;
}

function competitionDay(m: Match) {
  const at = m.scheduledAt ?? m.roomOpenedAt ?? m.review?.startedAt;
  return at
    ? new Date(Date.parse(at) + 8 * 3600000).toISOString().slice(0, 10)
    : null;
}
/** UTC+8 day boundaries of saved competition records, never import dates. */
export function competitionPeriods(archive: HistoricalArchive) {
  const played = archive.matches.filter(
    (m) => m.score !== null || m.forfeitWinner !== undefined,
  );
  const days = (matches: Match[]) =>
    matches
      .map(competitionDay)
      .filter((d): d is string => d !== null)
      .sort();
  const all = days(played);
  const finals = days(played.filter((m) => m.round?.phase === "final"));
  const start = (d?: string) => (d ? `${d}T00:00:00+08:00` : null);
  const end = (d?: string) => (d ? `${d}T23:59:59+08:00` : null);
  const season = all.length
    ? {
        startsAt: start(all[0]),
        endsAt: end(finals.at(-1)),
        timeZone: "Asia/Shanghai",
        precision: "day" as const,
      }
    : undefined;
  const schedule = (["group", "knockout", "final"] as const).map((phase) => {
    const values = days(
      played.filter((m) =>
        phase === "group"
          ? m.round?.phase === "group" || m.round?.phase === "swiss"
          : m.round?.phase === phase,
      ),
    );
    return {
      label:
        phase === "group"
          ? archive.editionSlug === "s6"
            ? "瑞士轮"
            : "小组赛"
          : phase === "knockout"
            ? "淘汰赛"
            : "总决赛",
      kind: phase === "group" ? ("group" as const) : ("knockout" as const),
      at: start(values[0]),
      endAt: end(values.at(-1)),
      precision: "day" as const,
    };
  });
  return { season, schedule };
}

function main() {
  const [inputDir, output, updatesDir] = process.argv.slice(2);
  if (!inputDir || !output)
    throw new Error("Usage: INPUT_DIR OUTPUT_REVIEW_JSON");
  if (updatesDir) {
    if (
      !isAbsolute(updatesDir) ||
      !relative(process.cwd(), resolve(updatesDir)).startsWith("..")
    )
      throw new Error(
        "Complete local updates must stay outside the repository",
      );
    mkdirSync(updatesDir, { recursive: true });
  }
  const seasons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
    const raw = readFileSync(join(inputDir, `s${n}.json`));
    const saved = JSON.parse(raw.toString());
    const before = historicalArchiveSchema.parse(saved.edition.archive);
    const dateSources = JSON.parse(
      readFileSync(
        new URL(
          "../docs/imports/remaining-mp-date-sources.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const after = addVerifiedRoomDates(
      proposeMetadata(before),
      dateSources.matches,
    );
    const periods = competitionPeriods(after);
    if (periods.season) after.season = periods.season;
    historicalArchiveSchema.parse(after);
    if (statisticsArchiveKey(before) !== statisticsArchiveKey(after))
      throw new Error("Final proposal changed statistics identity");
    if (updatesDir) {
      if (saved.edition.schedule.length)
        throw new Error(
          "Review existing authored milestones before replacing schedule",
        );
      const edition = editionSchema.parse({
        ...saved.edition,
        archive: after,
        schedule: periods.schedule,
      });
      writeFileSync(
        join(updatesDir, `s${n}-archive.json`),
        JSON.stringify(after, null, 2) + "\n",
      );
      writeFileSync(
        join(updatesDir, `s${n}-edition.json`),
        JSON.stringify(edition, null, 2) + "\n",
      );
    }
    return {
      editionSlug: before.editionSlug,
      revision: saved.revision,
      published: saved.edition.published,
      inputSha256: createHash("sha256").update(raw).digest("hex"),
      sourceUrl: before.sourceUrl,
      statisticsKeyUnchanged: true,
      knownIdentities: before.players.length,
      unresolvedPositions: before.unresolvedPlayers?.length ?? 0,
      teamCount: before.teams.length,
      season: after.season,
      schedule: periods.schedule,
      finalPlacements:
        after.finalPlacements?.map((r) => ({
          ...r,
          teamName: before.teams.find((t) => t.id === r.teamId)!.name,
        })) ?? [],
      standings: after.standings.map(
        ({ teamId, scope, placement, tied, qualified, official, note }) => ({
          teamId,
          scope,
          placement,
          tied,
          qualified,
          official,
          note,
        }),
      ),
      matches: after.matches.map((m) => ({
        fixtureId: m.id,
        label: m.label,
        ...matchMetadata(after.editionSlug, m),
        adjudication: m.adjudication,
        scheduledAt: m.scheduledAt,
        roomOpenedAt: m.roomOpenedAt ?? null,
        mpUrls: m.mpUrls,
      })),
      pending: [
        "Native Admin application, publication and public readback after deployment",
        ...(!after.season ? ["Official/accepted season window"] : []),
        ...(n === 3
          ? ["Last two match formats conflict with general BO11 rule"]
          : []),
      ],
    };
  });
  writeFileSync(
    output,
    JSON.stringify(
      {
        kind: "historical-metadata-review-not-importable",
        organizerAcceptance:
          "https://github.com/OCLR-dev/OCLR-website/issues/610#issuecomment-6555006692",
        generatedFrom:
          "Explicit local Admin downloads; private appendices omitted",
        seasons,
      },
      null,
      2,
    ) + "\n",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
