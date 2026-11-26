import { chatAnalysisIntent } from "./chat-analysis-intent";
import { chatTechnicalAnalysis } from "./chat-technical-analysis";
import { chatRequestBlockReason } from "./chat-request-filter";
import {
  chatDirectoryPlayers,
  chatPlayerDirectorySources,
  playerDirectoryRequest,
} from "./chat-player-directory";
import {
  draftRecommendationRequest,
  draftCandidateSources,
} from "./chat-draft-candidates";
import { chatPlayerProfile } from "./chat-player-profile";
import { artworkQuery, artworkSources } from "./chat-artwork";
import { seasonCount, seasonCountIntent } from "./chat-season-counts";
import {
  chatSeasonScope,
  seasonOnlyFollowup,
  type ChatSeasonSummary,
} from "./chat-season-scope";
import type { Edition } from "./editions";
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
  type ChatSource,
  rankedSources,
  publishedRuleChapters,
  ruleExcerpts,
} from "./chat-retrieval";
import { informationPreview } from "./tournament-information";
import { tournamentTimeline } from "./tournament-timeline";
function nextMatchQuestion(question: string) {
  return /下一[場场]|\bnext\b/i.test(question);
}

type ChatEvidence = {
  edition: string;
  sources: ChatSource[];
  total: Awaited<ReturnType<typeof seasonCount>>;
  blocked?: NonNullable<ReturnType<typeof chatRequestBlockReason>>;
  technical?: Awaited<ReturnType<typeof chatTechnicalAnalysis>>;
  greeting?: true;
  draftRecommendation?: true;
  playerProfile?: true;
  playerDirectory?: true;
  mappoolDirectory?: true;
  competitionPage?: true;
  artworkSearch?: string;
  seasonScope?: ChatSeasonSummary;
  historicalCounts?: { unavailable: string[] };
};

export async function chatEvidence(
  slug: string,
  question: string,
  previous: string,
  now = Date.now(),
  signal?: AbortSignal,
  onEmbeddingFallback?: (error: unknown) => void,
  previousAnswer = "",
): Promise<ChatEvidence> {
  const selected = await getPublicEdition(slug);
  if (!selected) throw new HttpError(404, "Tournament not found.");
  const blocked = chatRequestBlockReason(question);
  if (blocked)
    return { edition: selected.name, blocked, total: null, sources: [] };
  if (
    /^(?:(?:莉露[，,\s]*)?(?:你好|您好|嗨|哈[囉啰]|早安|早上好|午安|晚安)(?:[，,\s]*莉露)?|(?:hello|hi|hey|good morning|good afternoon|good evening)(?:[,\s]+liru)?)\s*[?!.，,。？！]*$/i.test(
      question.trim().normalize("NFKC"),
    )
  )
    return {
      edition: selected.name,
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
      edition: selected.name,
      total: null,
      sources: [
        {
          title: selected.name,
          url: "/tournaments/" + slug,
          text: "Liru can answer questions about published information for this season and past OCLR seasons: rules, dates, players, teams, draft picks, mappools, fixtures, results and statistics. Examples include how many upcoming matches have a start time, how many Hidden (HD) slots the mappools contain, and how many draft picks were published. For similarity and practice from published seasons, ask for similar beatmaps with a BID and MOD, or ask for player strengths and practice recommendations with an osu! UID. Availability depends on what has been published.",
        },
      ],
    };
  }
  const direct = chatAnalysisIntent(question, "");
  const technical =
    direct ??
    chatAnalysisIntent(question, previous) ??
    (seasonOnlyFollowup(question)
      ? chatAnalysisIntent(previous, "")
      : undefined);
  if (technical)
    return {
      edition: selected.name,
      technical: await chatTechnicalAnalysis(
        technical,
        selected,
        question,
        direct ? "" : previous,
        signal,
      ),
      total: null,
      sources: [],
    };
  // Prior answers can supply search terms for references, but only current
  // publication-checked hits are returned as evidence.
  const refersBack =
    /剛[才剛刚]|刚[才剛刚]|第[一二三四五六七八九十0-9]+[个位個名項项隊队場场]|[他她它]的|那[个位個隊队張张]|前面|上述|\b(?:first|second|third|fourth|latter|former|they|their|that one|you mentioned)\b/i.test(
      question,
    );
  const previousSearch =
    refersBack && previousAnswer ? previous + "\n" + previousAnswer : previous;

  const draft = draftRecommendationRequest(question, previous);
  const scope = await chatSeasonScope(
    selected,
    question,
    previous,
    refersBack || !!draft?.previous,
  );
  if (draft) {
    const target =
      !scope || scope.summary.allPublished
        ? selected
        : scope.editions.length === 1
          ? scope.editions[0]
          : null;
    return {
      edition: target?.name ?? selected.name,
      draftRecommendation: true as const,
      seasonScope: scope?.summary.allPublished ? undefined : scope?.summary,
      total: null,
      sources: target
        ? await draftCandidateSources(target, question, draft.previous)
        : [],
    };
  }
  if (!scope)
    return seasonEvidence(
      selected,
      question,
      previous,
      previousSearch,
      now,
      signal,
      onEmbeddingFallback,
    );

  const scopedQuestion = scope.question || question;
  const evidence =
    scope.editions.length === 1 && !scope.summary.allPublished
      ? await seasonEvidence(
          scope.editions[0],
          scopedQuestion,
          previous,
          previousSearch,
          now,
          signal,
          onEmbeddingFallback,
        )
      : await historyEvidence(
          selected,
          scope.editions,
          scopedQuestion,
          previous,
          previousSearch,
          now,
          signal,
          onEmbeddingFallback,
        );
  return { ...evidence, seasonScope: scope.summary };
}

async function historyEvidence(
  selected: Edition,
  editions: Edition[],
  question: string,
  previous: string,
  previousSearch: string,
  now: number,
  signal?: AbortSignal,
  onEmbeddingFallback?: (error: unknown) => void,
) {
  const base = { edition: selected.name, total: null };
  if (!editions.length) return { ...base, sources: [] };
  const count = seasonCountIntent(question);
  if (count) {
    const sources = [];
    const unavailableCounts = [];
    for (const edition of editions) {
      const result = await seasonCount(edition, count, now);
      if (result)
        sources.push({
          ...result.source,
          title: edition.name + " · " + result.source.title,
          text: JSON.stringify({
            edition: edition.name,
            ...result,
            source: undefined,
          }),
        });
      else unavailableCounts.push(edition.name);
    }
    return {
      ...base,
      historicalCounts: { unavailable: unavailableCounts },
      sources,
    };
  }
  const player = await chatPlayerProfile(selected, question, previous);
  if (player)
    return { ...base, playerProfile: true as const, sources: [player] };
  const visual = artworkQuery(question);
  if (visual !== null)
    return {
      ...base,
      artworkSearch: visual,
      sources: await searchSeasonIndex(
        editions,
        visual,
        "",
        signal,
        "artwork",
        onEmbeddingFallback,
      ),
    };
  return {
    ...base,
    sources: await searchSeasonIndex(
      editions,
      question,
      previousSearch,
      signal,
      undefined,
      onEmbeddingFallback,
    ),
  };
}

async function seasonEvidence(
  edition: Edition,
  question: string,
  previous: string,
  previousSearch: string,
  now: number,
  signal?: AbortSignal,
  onEmbeddingFallback?: (error: unknown) => void,
) {
  const slug = edition.slug;
  const mappoolLink = linksToSeasonSection(question, slug, "mappools");
  const mappoolContext =
    mappoolLink || linksToSeasonSection(previous, slug, "mappools");
  let visual = artworkQuery(question, mappoolContext);
  if (!visual && (visual === "" || mappoolLink))
    visual = artworkQuery(previous, true) ?? visual;
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
      artworkSearch: visual,
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
        previousSearch,
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
    previousSearch,
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
