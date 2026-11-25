import { chatRequestBlockReason } from "./chat-request-filter";
import {
  chatDirectoryPlayers,
  chatPlayerDirectorySources,
  playerDirectoryRequest,
} from "./chat-player-directory";
import { chatPlayerProfile } from "./chat-player-profile";
import { artworkQuery, artworkSources } from "./chat-artwork";
import { seasonCount, seasonCountIntent } from "./chat-season-counts";
import { seasonContent } from "./chat-season-content";
import { searchSeasonIndex } from "./chat-vectors";
import {
  isUpcomingMatch,
  matches,
  matchSource,
  poolSources,
  scheduleOverview,
} from "./chat-competition-sources";
import { getPublicEdition } from "./content";
import { HttpError } from "./http-error";
import {
  linksToSeasonSection,
  rankedSources,
  publishedRuleChapters,
  ruleExcerpts,
} from "./chat-retrieval";
import { informationPreview } from "./tournament-information";
import { tournamentTimeline } from "./tournament-timeline";
function nextMatchQuestion(question: string) {
  return /下一[場场]|\bnext\b/i.test(question);
}

export async function chatEvidence(
  slug: string,
  question: string,
  previous: string,
  now = Date.now(),
  signal?: AbortSignal,
  onEmbeddingFallback?: (error: unknown) => void,
) {
  const edition = await getPublicEdition(slug);
  if (!edition) throw new HttpError(404, "Tournament not found.");
  const blocked = chatRequestBlockReason(question);
  if (blocked)
    return { edition: edition.name, blocked, total: null, sources: [] };
  if (
    /^(?:(?:莉露[，,\s]*)?(?:你好|您好|嗨|哈[囉啰]|早安|早上好|午安|晚安)(?:[，,\s]*莉露)?|(?:hello|hi|hey|good morning|good afternoon|good evening)(?:[,\s]+liru)?)\s*[?!.，,。？！]*$/i.test(
      question.trim().normalize("NFKC"),
    )
  )
    return {
      edition: edition.name,
      greeting: true as const,
      total: null,
      sources: [],
    };
  if (
    /^(?:(?:請問|请问)?(?:你|莉露)(?:可以|能|會|会)(?:回答|查詢|查询|幫我查|帮我查)(?:些)?(?:什麼|什么|哪些問題|哪些问题)|what can (?:you|liru) (?:answer|do|help (?:me )?with))\s*[?？。!！]*$/i.test(
      question.trim(),
    )
  ) {
    return {
      edition: edition.name,
      total: null,
      sources: [
        {
          title: edition.name,
          url: "/tournaments/" + slug,
          text: "Liru can answer questions about published information for this season: rules, dates, players, teams, draft picks, mappools, fixtures, results and statistics. Examples include how many upcoming matches have a start time, how many Hidden (HD) slots the mappools contain, and how many draft picks were published. Availability depends on what has been published.",
        },
      ],
    };
  }
  const mappoolLink = linksToSeasonSection(question, slug, "mappools");
  const mappoolContext =
    mappoolLink || linksToSeasonSection(previous, slug, "mappools");
  const visual =
    artworkQuery(question, mappoolContext) ??
    (mappoolLink ? artworkQuery(previous, true) : null);
  if (visual !== null) {
    const indexed = visual
      ? await searchSeasonIndex(
          edition,
          visual,
          "",
          signal,
          "artwork",
          onEmbeddingFallback,
        )
      : [];
    const sources = indexed.length ? indexed : await artworkSources(edition);
    return {
      edition: edition.name,
      total: null,
      sources:
        indexed.length || !visual
          ? sources.slice(0, 8)
          : rankedSources(sources, visual, 8),
    };
  }
  const countIntent = seasonCountIntent(question);
  if (countIntent) {
    const total = await seasonCount(edition, countIntent, now);
    return {
      edition: edition.name,
      total,
      sources: total ? [total.source] : [],
    };
  }
  if (mappoolLink) {
    const [overview, ...maps] = await poolSources(edition);
    return {
      edition: edition.name,
      mappoolDirectory: true as const,
      total: null,
      sources: [
        overview,
        ...rankedSources(maps, question + " " + previous, 6, true),
      ],
    };
  }
  const competitionPage = (["teams", "draft", "schedule"] as const).find(
    (section) => linksToSeasonSection(question, slug, section),
  );
  if (competitionPage) {
    const context = question + " " + previous;
    if (competitionPage === "schedule" && nextMatchQuestion(context)) {
      const fixtures = await matches(edition);
      const next = fixtures
        .filter((match) => isUpcomingMatch(match, now))
        .sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!))[0];
      const overview = scheduleOverview(edition, fixtures);
      return {
        edition: edition.name,
        competitionPage: true as const,
        total: null,
        sources: next
          ? [overview, matchSource(edition, next)]
          : [
              {
                ...overview,
                text: overview.text + "\nNo upcoming published match.",
              },
            ],
      };
    }
    const [overview, ...details] = await seasonContent(
      edition,
      competitionPage === "schedule" ? "matches" : competitionPage,
    );
    return {
      edition: edition.name,
      competitionPage: true as const,
      total: null,
      sources: [overview, ...rankedSources(details, context, 6, true)],
    };
  }
  const player = await chatPlayerProfile(edition, question, previous);
  if (player)
    return {
      edition: edition.name,
      playerProfile: true as const,
      total: null,
      sources: [player],
    };
  if (
    /\b(?:ETX|SIP)\b/i.test(question) &&
    /\b(?:mods?|skillsets?|sr|pp|nm|hd|hr|dt|fm|no ?mod|hidden|hard ?rock|double ?time|free ?mod|aim|(?:low|high) ar|high bpm|tapping|precision|technical)\b|分[項项]|技能/i.test(
      question,
    )
  ) {
    return {
      edition: edition.name,
      total: null,
      sources: await searchSeasonIndex(
        edition,
        question,
        previous,
        signal,
        "players",
        onEmbeddingFallback,
      ),
    };
  }
  const metrics = playerDirectoryRequest(slug, question, previous);
  if (metrics !== null)
    return {
      edition: edition.name,
      playerDirectory: true as const,
      total: null,
      sources: chatPlayerDirectorySources(
        slug,
        await chatDirectoryPlayers(edition),
        metrics,
      ),
    };
  const base = "/tournaments/" + slug;
  const matchIntent =
    /賽程|赛程|比[分賽赛]|賽果|赛果|下一[場场]|對陣|对阵|schedule|match|score|result|fixture|who won/i;
  const timingIntent =
    /時候|时候|[時时]間|时间|[幾几][點点號号月日]|哪[天日]|何[時时]|[開开]始|[開开][打賽赛放]|截止|[結结]束|日期|[賽赛]程|\b(?:when|start(?:s|ing)?|begins?|dates?|deadlines?|schedule|what time)\b/i;
  const poolIntent =
    /[圖图]池|曲池|mappool|map pool|beatmap|\b(?:nm|hd|hr|dt|fm|tb)\d*\b/i;
  const questionWithContext = question + " " + previous;
  const intentText =
    matchIntent.test(question) || poolIntent.test(question)
      ? question
      : questionWithContext;
  const rules = ruleExcerpts(publishedRuleChapters(edition));
  const sources = rankedSources(rules, question, 3);
  if (!sources.length && previous)
    sources.push(...rankedSources(rules, questionWithContext, 2));
  const timing = timingIntent.test(intentText);
  if (timing && !edition.archive) {
    const preview = informationPreview(slug);
    const rows =
      preview?.schedule ??
      tournamentTimeline(edition, (label) => label, "en").schedule;
    const zone = preview?.timeZone ?? edition.timeZone;
    const timeline = rows.map((row) => ({
      title: row.event,
      url: base + "#schedule",
      text: row.event + " · " + row.date + " (" + zone + ")",
    }));
    sources.push(...rankedSources(timeline, questionWithContext, 8, true));
  }
  if (
    matchIntent.test(intentText) ||
    (timing && (edition.archive || !sources.length))
  ) {
    let fixtures = await matches(edition);
    const next = nextMatchQuestion(intentText);
    if (next)
      fixtures = fixtures
        .filter((f) => isUpcomingMatch(f, now))
        .sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
    else if (timing && edition.archive && !matchIntent.test(intentText))
      fixtures = fixtures
        .filter((f) => f.time && !f.cancelled)
        .sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
    else
      fixtures.sort(
        (a, b) =>
          (Date.parse(b.time ?? "") || 0) - (Date.parse(a.time ?? "") || 0),
      );
    const candidates = fixtures.map((fixture) => matchSource(edition, fixture));
    sources.push(
      ...(candidates.length
        ? rankedSources(candidates, questionWithContext, next ? 1 : 4, true)
        : [
            {
              title: edition.name,
              url: base + "/schedule",
              text: next
                ? "No upcoming published match."
                : "No published fixtures.",
            },
          ]),
    );
  }
  if (poolIntent.test(intentText)) {
    const maps = await poolSources(edition);
    sources.push(...rankedSources(maps, questionWithContext, 16, true));
  }
  const indexed = await searchSeasonIndex(
    edition,
    question,
    previous,
    signal,
    undefined,
    onEmbeddingFallback,
  );
  const unique = new Map(
    [...indexed, ...sources].map((s) => [
      JSON.stringify([s.url, s.title, s.text]),
      s,
    ]),
  );
  return { edition: edition.name, total: null, sources: [...unique.values()] };
}
