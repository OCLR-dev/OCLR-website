import { readOnlyData } from "@/db";
import type { ChatSource } from "./chat-retrieval";
import type { Edition } from "./editions";
import { readDirectoryEtxRatings } from "./etx-rating";
import { eventPreview } from "./event-preview";
import { readCachedOtrRatings } from "./otr-rating-cache";
import {
  directoryMetrics,
  directoryMetricValue,
  directoryState,
  publicDirectoryEtx,
  publicDirectoryPlayer,
  selectDirectoryPlayers,
  type DirectoryMetric,
} from "./player-directory";
import { importedRatingsEdition } from "./player-rating-import-contract";
import { publicPlayerDirectoryModel } from "./public-read-models";

const metricLabels: Record<DirectoryMetric, string> = {
  rank: "osu!standard global rank",
  pp: "PP",
  otr: "o!TR (OTR)",
  sip: "SIP",
  etx: "ETX",
};

function linksToDirectory(text: string, slug: string) {
  return [
    ...text.matchAll(
      /(?:^|[\s<(]|\[)(?:https:\/\/(?:www\.)?oclr\.org)?\/tournaments\/([a-z0-9-]+)\/players(?=\/?(?:$|[?#\s>),，。]))/gi,
    ),
  ].some((match) => match[1] === slug);
}

export function playerDirectoryRequest(
  slug: string,
  question: string,
  previous: string,
): DirectoryMetric[] | null {
  const asksListOrComparison =
    /名[單单]|清[單单]|列出|有哪些|有[誰谁]|[誰谁].{0,8}[強强]|[最較较][強强]|排行|前[幾几\d]|\b(?:list|top|strongest|stronger|best|compare)\b/i.test(
      question,
    );
  const linked = linksToDirectory(question, slug);
  const previousLink = asksListOrComparison && linksToDirectory(previous, slug);
  const text = (linked ? `${question} ${previous}` : question).normalize(
    "NFKC",
  );
  const requested: DirectoryMetric[] = [];
  if (/\bpp\b/i.test(text)) requested.push("pp");
  if (/\bo!?tr\b/i.test(text)) requested.push("otr");
  if (/\bsip\b/i.test(text)) requested.push("sip");
  if (/\betx\b/i.test(text)) requested.push("etx");
  if (
    /全球排名|世界排名|\bglobal rank(?:ed|ing)?\b/i.test(text) ||
    (!requested.length && /排名|排行|\brank(?:ed|ing)?\b/i.test(text))
  )
    requested.unshift("rank");
  const asksRoster =
    /[選选]手|玩家|[參参][賽赛]者|[報报]名(?:名[單单]|清[單单])|\b(?:players?|participants?|roster|registrants?|registration list)\b/i.test(
      question,
    );
  return linked ||
    previousLink ||
    (asksRoster && (requested.length || asksListOrComparison))
    ? requested
    : null;
}

export async function chatDirectoryPlayers(edition: Edition) {
  return readOnlyData(async () => {
    const { rows } = await publicPlayerDirectoryModel(edition.slug);
    // These extra caches are released on the live Season 11 directory.
    const useRatings =
      edition.slug === importedRatingsEdition &&
      !edition.archive &&
      !eventPreview(edition.slug);
    const ids = rows.map((player) => player.osuId);
    const otr = useRatings ? await readCachedOtrRatings(ids) : undefined;
    const etx = useRatings ? await readDirectoryEtxRatings(ids) : undefined;
    const players = rows.map((row) => {
      const player = publicDirectoryPlayer(row);
      const stars = publicDirectoryEtx(row, etx?.get(player.id));
      return {
        ...player,
        participation: row.participation,
        tier: row.tier,
        tierLabel: row.tierLabel,
        bio: row.bio,
        rank: directoryMetricValue(player.rank, "rank"),
        pp: directoryMetricValue(player.pp, "pp"),
        otr: directoryMetricValue(otr?.get(player.id)?.value, "otr"),
        sip: directoryMetricValue(player.sip, "sip"),
        etx: directoryMetricValue(stars?.value, "etx"),
        etxProvisional: stars?.provisional,
        etxOutdated: stars?.outdated,
        osuStatisticsFetchedAt: row.statistics.fetchedAt,
      };
    });
    return selectDirectoryPlayers(
      players,
      directoryState(new URLSearchParams()),
    );
  });
}

export function chatPlayerDirectorySources(
  slug: string,
  directory: Awaited<ReturnType<typeof chatDirectoryPlayers>>,
  requested: readonly DirectoryMetric[] = [],
): ChatSource[] {
  const url = `/tournaments/${slug}/players`;
  const sources: ChatSource[] = [
    {
      url,
      title: "Public player directory",
      text: JSON.stringify({
        directoryEntries: directory.length,
        sample: directory.slice(0, 8).map((player) => player.name),
      }),
    },
  ];
  const players = directory.filter(
    (player) => player.participation !== "coach",
  );
  for (const metric of requested.length ? requested : directoryMetrics) {
    const rows = players.flatMap((player) => {
      const value = player[metric];
      return value === null
        ? []
        : [{ osuId: player.id, name: player.name, value, player }];
    });
    if (!rows.length && !requested.length) continue;
    const direction = metric === "rank" ? 1 : -1;
    rows.sort((a, b) => direction * (a.value - b.value) || a.osuId - b.osuId);
    sources.push({
      url,
      title: `Players · ${metricLabels[metric]}`,
      text: JSON.stringify({
        metric: metricLabels[metric],
        order: metric === "rank" ? "lower numeric rank first" : "higher first",
        totalPlayers: players.length,
        playersWithValue: rows.length,
        top: rows.slice(0, 5).map(({ name, value, player }) => ({
          name,
          value,
          ...(metric === "etx" && {
            provisional: player.etxProvisional,
            outdated: player.etxOutdated,
          }),
        })),
      }),
    });
  }
  return sources;
}
