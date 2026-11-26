import { getPublicEditions } from "./content";
import type { Edition } from "./editions";
import { seasonNumber } from "./player-timeline";

const seasonReference =
  /(?:https:\/\/(?:www\.)?oclr\.org)?\/tournaments\/([a-z0-9-]{1,80})(?=[/?#\s),，。]|$)|\b(?:s|season\s+)0*(\d{1,3})\b|第\s*(\d{1,3}|十[一二三四五六七八九]?|[一二三四五六七八九]十[一二三四五六七八九]?|[一二三四五六七八九])\s*(?:[賽赛]季|季|[屆届])/gi;
const allSeasons =
  /[歷历][屆届]|跨[季屆届]|跨[賽赛]季|(?:以往|過往|过往|過去|过去|歷史|历史|所有|全部|全|各個|各个|各)[\s的]*(?:已[發发]布[的]?\s*)?(?:OCLR\s*)?(?:[賽赛]季|[屆届]|[賽赛]事)|\b(?:(?:all|past|previous|historical|every|across)\s+(?:published\s+)?(?:OCLR\s+)?(?:seasons?|editions?|tournaments?))\b/i;
const currentSeason =
  /本[屆届季]|[這这][屆届季]|本[賽赛]季|[當当][前下][賽赛]季|\b(?:this|current) season\b/i;

export function seasonOnlyFollowup(question: string) {
  const normalized = question.normalize("NFKC");
  const rest = normalized
    .replace(seasonReference, " ")
    .replace(allSeasons, " ")
    .replace(currentSeason, " ");
  return (
    rest !== normalized &&
    /^(?:(?:那(?:[麼么])?\s*)|(?:改(?:查|成|用)?|[換换]成|只看|查|what about|how about|switch to|only|in|for)\s*)?(?:\s|[、,，與与和及/]|\band\b)*呢?[。？！?!.]*\s*$/iu.test(
      rest.trim(),
    )
  );
}

export function chatSeasonSubject(question: string) {
  return question
    .normalize("NFKC")
    .replace(seasonReference, (match, slug: string | undefined) =>
      slug ? match : " ",
    )
    .replace(allSeasons, "")
    .replace(/^\s*(?:的|在|(?:in|for)\b)\s*/i, "")
    .replace(/\s+(?:in|for|of)(?=\s*[?!.。]*\s*$)/i, "")
    .trim();
}

function numericSeason(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digit = (text: string) => "〇一二三四五六七八九".indexOf(text || "〇");
  if (!value.includes("十")) return digit(value);
  const [tens, ones] = value.split("十");
  return (tens ? digit(tens) : 1) * 10 + digit(ones);
}

export type ChatSeasonSummary = {
  editions: Pick<Edition, "name" | "slug">[];
  unavailable: string[];
  allPublished: boolean;
};

type ChatSeasonScope = {
  editions: Edition[];
  question: string;
  summary: ChatSeasonSummary;
};

export async function chatSeasonScope(
  selected: Edition,
  question: string,
  previous: string,
  refersBack: boolean,
  defaultAll = false,
): Promise<ChatSeasonScope | null> {
  const normalized = question.normalize("NFKC");
  const references = [...normalized.matchAll(seasonReference)];
  const all = allSeasons.test(normalized);
  const mentionsCurrent = currentSeason.test(normalized);
  if (!references.length && !all) {
    if (refersBack && previous && !mentionsCurrent) {
      const scope = await chatSeasonScope(
        selected,
        previous,
        "",
        false,
        defaultAll,
      );
      if (scope) return { ...scope, question };
    }
    if (!defaultAll) return null;
    const editions = mentionsCurrent ? [selected] : await getPublicEditions();
    return {
      editions,
      question,
      summary: {
        editions: editions.map(({ slug, name }) => ({ slug, name })),
        unavailable: [],
        allPublished: !mentionsCurrent,
      },
    };
  }

  const published = await getPublicEditions();
  const targets = references.map(([, slug, short, number]) => {
    const season = short || number ? numericSeason(short || number) : null;
    const edition = slug
      ? published.find((item) => item.slug === slug.toLowerCase())
      : published.find(
          (item) =>
            item.slug === "s" + season ||
            (season !== null && seasonNumber(item.season) === season),
        );
    return { label: slug ?? "S" + season, edition };
  });
  const requested = targets.flatMap(({ edition }) =>
    edition ? [edition] : [],
  );
  if (mentionsCurrent) requested.push(selected);
  const editions =
    references.length > 0
      ? [...new Map(requested.map((item) => [item.slug, item])).values()]
      : published;
  return {
    editions,
    // Keep page links for the readers that recognize a published section URL.
    question: chatSeasonSubject(normalized),
    summary: {
      editions: editions.map(({ name, slug }) => ({ name, slug })),
      unavailable: targets.flatMap(({ label, edition }) =>
        edition ? [] : [label],
      ),
      allPublished: all && !references.length,
    },
  };
}
