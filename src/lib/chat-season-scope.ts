import { getPublicEditions } from "./content";
import type { Edition } from "./editions";
import { seasonNumber } from "./player-timeline";

const seasonReference =
  /(?:https:\/\/(?:www\.)?oclr\.org)?\/tournaments\/([a-z0-9-]{1,80})(?=[/?#\s),，。]|$)|\b(?:s|season\s+)0*(\d{1,3})\b|第\s*(\d{1,3}|十[一二三四五六七八九]?|[一二三四五六七八九]十[一二三四五六七八九]?|[一二三四五六七八九])\s*(?:[賽赛]季|季|[屆届])/gi;
const allSeasons =
  /[歷历][屆届]|跨[季屆届]|跨[賽赛]季|(?:以往|過往|过往|過去|过去|歷史|历史|所有|全部|全|各個|各个|各)[\s的]*(?:OCLR\s*)?(?:[賽赛]季|[屆届]|[賽赛]事)|\b(?:(?:all|past|previous|historical|every|across)\s+(?:OCLR\s+)?(?:seasons?|editions?|tournaments?))\b/i;
const currentSeason =
  /本[屆届]|這[屆届]|这[屆届]|本[賽赛]季|\b(?:this|current) season\b/i;

function numericSeason(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digit = (text: string) => "〇一二三四五六七八九".indexOf(text || "〇");
  if (!value.includes("十")) return digit(value);
  const [tens, ones] = value.split("十");
  return (tens ? digit(tens) : 1) * 10 + digit(ones);
}

export async function chatSeasonScope(
  selected: Edition,
  question: string,
  previous: string,
  refersBack: boolean,
) {
  const normalized = question.normalize("NFKC");
  const references = [...normalized.matchAll(seasonReference)];
  const all = allSeasons.test(normalized);
  const mentionsCurrent = currentSeason.test(normalized);
  if (!references.length && !all) {
    if (refersBack && previous && !mentionsCurrent) {
      const scope = await chatSeasonScope(selected, previous, "", false);
      if (scope) return { ...scope, question };
    }
    return null;
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
    question: normalized
      // Keep published page links so the direct route readers still recognize them.
      .replace(seasonReference, (match, slug: string | undefined) =>
        slug ? match : " ",
      )
      .replace(allSeasons, " ")
      .replace(/^\s*(?:的|在|in|for)\s*/i, "")
      .replace(/\s+(?:in|for|of)\s*$/i, "")
      .trim(),
    summary: {
      editions: editions.map(({ name, slug }) => ({ name, slug })),
      unavailable: targets.flatMap(({ label, edition }) =>
        edition ? [] : [label],
      ),
      allPublished: all && !references.length,
    },
  };
}
