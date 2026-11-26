import { readOnlyData } from "@/db";
import { publicCaptains } from "./captain-reads";
import {
  chatDirectoryPlayers,
  chatPlayerDirectorySources,
  playerDirectoryRequest,
} from "./chat-player-directory";
import type { ChatSource } from "./chat-retrieval";
import { publicDraft } from "./draft-reads";
import type { Edition } from "./editions";
import { readListedPlayerRatings } from "./listed-player-ratings";

export function asksDraftRecommendation(question: string) {
  const text = question.normalize("NFKC");
  if (
    /^(?:(?:我|我們|我们)\s*)?(?:可不可以|可以|能不能|能)[選选]\s*[^。？?]{1,32}(?:嗎|吗)\s*[?？]?$/i.test(
      text,
    ) &&
    !/[圖图]|[譜谱]面|\b(?:nm|hd|hr|dt|fm|tb)\d+\b/i.test(text)
  )
    return true;
  return /(?:可以|[應应][該该]|能|[該该]|建[議议])[^。？?]{0,20}[選选挑]\s*(?:[誰谁]|哪(?:一?[位個个]|些))|(?:[選选]秀|[補补](?:[強强]|充))[^。？?]{0,28}(?:推薦|推荐|[選选]手|[強强]手|[選选挑]\s*[誰谁])|(?:推薦|推荐)[^。？?]{0,16}(?:[選选]誰|[選选]手)|\b(?:who (?:can|should|could) (?:we|i) (?:pick|draft)|can (?:we|i) draft|recommend (?:a |some )?(?:draft (?:pick|candidate)|players?))\b/i.test(
    text,
  );
}

function requestedSipSkill(question: string) {
  const text = question
    .normalize("NFKC")
    .replace(/高\s*AR/gi, "High AR")
    .replace(/低\s*AR/gi, "Low AR");
  return text
    .match(
      /\b(?:(?:high|low)[ -]*ar|high[ -]*bpm|tapping|aim|precision|technical)\b/i,
    )?.[0]
    .toLowerCase()
    .replace(/[ -]/g, "");
}

export async function draftCandidateSources(
  edition: Edition,
  question: string,
): Promise<ChatSource[]> {
  if (edition.archive) return [];
  return readOnlyData(async () => {
    const draft = await publicDraft(edition.slug);
    if (
      !draft?.pool ||
      !draft.activeTeam ||
      draft.turnIndex >= draft.turnCount ||
      !["ready", "live", "paused"].includes(draft.state)
    )
      return [];

    const captains = await publicCaptains(edition.slug);
    const excluded = new Set([
      ...captains.map((captain) => captain.osuId),
      draft.activeTeam.captain.osuId,
      ...draft.rosters.flatMap(({ team, players }) => [
        team.captain.osuId,
        ...players.map((player) => player.osuId),
      ]),
      ...draft.picks.flatMap(({ player, team }) => [
        player.osuId,
        team.captain.osuId,
      ]),
    ]);
    const candidates = draft.pool.filter(
      (player) => !excluded.has(player.osuId),
    );
    const url = "/tournaments/" + edition.slug + "/draft";
    const status = {
      draftState: draft.state,
      selectablePlayers: candidates.length,
    };
    const metric = requestedSipSkill(question);
    if (metric) {
      const ratings = await readListedPlayerRatings(
        candidates.map((player) => player.osuId),
        false,
      );
      const rated = candidates.flatMap((player) => {
        const skills = ratings.get(player.osuId)?.sip.api?.snapshot?.skillsets;
        const entry = Object.entries(skills ?? {}).find(
          ([label]) => label.toLowerCase().replace(/[ -]/g, "") === metric,
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
            requestedSkill: metric,
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
