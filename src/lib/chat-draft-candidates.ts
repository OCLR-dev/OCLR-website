import { readOnlyData } from "@/db";
import { sipModCode } from "./chat-rating-sources";
import {
  chatDirectoryPlayers,
  chatPlayerDirectorySources,
  playerDirectoryRequest,
} from "./chat-player-directory";
import type { ChatSource } from "./chat-retrieval";
import { publicDraftCandidatePool } from "./draft-reads";
import type { Edition } from "./editions";
import { readListedPlayerRatings } from "./listed-player-ratings";

function asksDraftRecommendation(question: string) {
  const text = question.normalize("NFKC");
  if (
    /^(?:(?:我|我們|我们)\s*)?(?:可不可以|可以|能不能|能)[選选]\s*[^。？?]{1,32}(?:嗎|吗)\s*[?？]?$/i.test(
      text,
    ) &&
    !/[圖图]|[譜谱]面|\b(?:nm|hd|hr|dt|fm|tb)\d+\b/i.test(text)
  )
    return true;
  return /(?:可以|[應应][該该]|能|[該该]|建[議议])[^。？?]{0,20}[選选挑]\s*(?:[誰谁]|哪(?:一?[位個个]|些))|(?:[選选]秀|[補补](?:[強强]|充))[^。？?]{0,28}(?:推薦|推荐|[選选]手|[強强]手|[選选挑]\s*[誰谁])|(?:推薦|推荐|建[議议])[^。？?]{0,30}(?:[誰谁]|[選选]手|[隊队][員员]|[團团][員员]|人[選选]|候[選选]人)|\b(?:who (?:can|should|could) (?:we|i) (?:pick|draft)|can (?:we|i) draft|recommend (?:a |some )?(?:draft (?:pick|candidate)|(?:(?:nm|hd|hr|dt|fm|hidden) )?(?:players?|teammates?)))\b/i.test(
    text,
  );
}

const shortRecommendationFollowUp =
  /^(?:那|再|換|换|what about\s+|and\s+)?\s*(?:(?:high|low|高|低)\s*ar|high\s*bpm|aim|tapping|technical|precision|nm|hd|hr|dt|fm|hidden|[還还]有(?:誰|谁|其他人[選选]))\s*(?:呢|[嗎吗])?\s*[?。!]*$/i;

export function draftRecommendationRequest(question: string, previous: string) {
  if (asksDraftRecommendation(question)) return { previous: "" };
  if (
    shortRecommendationFollowUp.test(question.normalize("NFKC").trim()) &&
    asksDraftRecommendation(previous)
  )
    return { previous };
  return null;
}

function requestedSipMetric(question: string) {
  const text = question
    .normalize("NFKC")
    .replace(/高\s*AR/gi, "High AR")
    .replace(/低\s*AR/gi, "Low AR");
  const skill = text.match(
    /\b(?:(?:high|low)[ -]*ar|high[ -]*bpm|tapping|aim|precision|technical)\b/i,
  )?.[0];
  if (skill)
    return {
      category: "skillsets" as const,
      key: skill.toLowerCase().replace(/[ -]/g, ""),
    };
  const mod = text.match(
    /\b(?:nm|hd|hr|dt|fm|no[ -]*mod|hidden|hard[ -]*rock|double[ -]*time|free[ -]*mod)\b/i,
  )?.[0];
  if (!mod) return null;
  return {
    category: "modifications" as const,
    key: sipModCode(mod.replace(/-/g, "")) ?? mod.toUpperCase(),
  };
}

export async function draftCandidateSources(
  edition: Edition,
  question: string,
  previous = "",
): Promise<ChatSource[]> {
  if (edition.archive) return [];
  return readOnlyData(async () => {
    const pool = await publicDraftCandidatePool(edition.slug);
    if (!pool) return [];
    const { state, candidates } = pool;
    const url = "/tournaments/" + edition.slug + "/draft";
    const status = {
      draftState: state,
      selectablePlayers: candidates.length,
    };
    const metric = requestedSipMetric(question) ?? requestedSipMetric(previous);
    if (metric) {
      const ratings = await readListedPlayerRatings(
        candidates.map((player) => player.osuId),
        false,
      );
      const rated = candidates.flatMap((player) => {
        const snapshot = ratings.get(player.osuId)?.sip.api?.snapshot;
        const entry = Object.entries(snapshot?.[metric.category] ?? {}).find(
          ([label]) =>
            (metric.category === "modifications"
              ? (sipModCode(label.replace(/-/g, "")) ?? label.toUpperCase())
              : label.toLowerCase().replace(/[ -]/g, "")) === metric.key,
        );
        if (!entry) return [];
        const [label, rating] = entry;
        return [
          {
            name: player.username,
            metric: label,
            value: rating.value,
            globalRank: rating.globalRank || null,
          },
        ];
      });
      rated.sort((a, b) => b.value - a.value);
      return [
        {
          url,
          title: "Public draft pool · SIP",
          text: JSON.stringify({
            ...status,
            requestedMetric: metric,
            candidatesWithRating: rated.length,
            candidates: rated.slice(0, 8),
          }),
        },
      ];
    }

    const ids = new Set(candidates.map((player) => player.osuId));
    const directory = (await chatDirectoryPlayers(edition)).filter((player) =>
      ids.has(player.id),
    );
    const metrics = playerDirectoryRequest(edition.slug, question, "") ?? [];
    return [
      {
        url,
        title: "Public draft pool",
        text: JSON.stringify({
          ...status,
          candidates: candidates.slice(0, 8).map((player) => player.username),
        }),
      },
      ...chatPlayerDirectorySources(edition.slug, directory, metrics)
        .slice(1)
        .map((source) => ({ ...source, url })),
    ];
  });
}
