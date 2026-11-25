import { readOnlyData } from "@/db";
import type { ChatSource } from "./chat-retrieval";
import type { Edition } from "./editions";
import { HttpError } from "./http-error";
import { playerCompetitionRecord } from "./player-competition";
import { publishedPlayerProfile } from "./player-profiles";
import { addressableUsername, databaseUsernameOwner } from "./player-username";

function playerTarget(question: string) {
  const query = question
    .trim()
    .replace(/[?？!！。]+$/, "")
    .trim();
  // A rating question may include a public profile link next to the question.
  const ratingLink = query.match(
    /(?:^|\s)https:\/\/oclr\.org\/players\/([1-9]\d*)(?:\/)?(?:\?edition=[a-z0-9-]+)?(?=[\s，。]|$)/i,
  );
  if (ratingLink && /\b(?:ETX|SIP)\b/i.test(query)) return ratingLink[1];
  const link = query.match(
    /^(?:https:\/\/oclr\.org)?\/players\/([^/?#]+)\/?(?:\?edition=[a-z0-9-]+)?$/i,
  )?.[1];
  if (link) {
    try {
      return decodeURIComponent(link);
    } catch {
      return null;
    }
  }
  const name =
    query.match(
      /^(?:請問|请问)?\s*(.+?)\s*(?:是[誰谁]|的(?:[個个]人[資资]料|[資资]料|[隊队]伍|排名|[賽赛]果|[戰战][績绩]|[參参][賽赛][紀纪記记][錄录]|pp)|打[過过]哪些[賽赛]季)$/i,
    )?.[1] ??
    query.match(/^(?:請問|请问)?\s*(.+?)\s*的\s*(?:ETX|SIP)\b/i)?.[1] ??
    query.match(
      /^(?:(?:what (?:is|are)|show me)\s+)?(.+?)[’']s\s+(?:ETX|SIP)\b/i,
    )?.[1] ??
    query.match(/^(?:who is|who's|tell me about)\s+(.+)$/i)?.[1] ??
    query.match(
      /^(?:(?:what (?:is|are)|show me)\s+)?(.+?)[’']s\s+(?:rank|pp|profile|team|stats|results)$/i,
    )?.[1];
  return name?.trim().replace(/^[「『“"@]+|[」』”"]+$/g, "") ?? null;
}

export async function chatPlayerProfile(
  edition: Pick<Edition, "slug" | "name">,
  question: string,
  previous: string,
): Promise<ChatSource | null> {
  const followUp =
    /^(?:是的?|[對对](?:的)?|yes|correct|(?:那)?(?:他|她)(?:的)?(?:排名|[戰战][績绩]|[隊队]伍|pp)(?:呢)?|(?:what about |and )?(?:their|his|her) (?:team|rank|pp|record))\s*[?？!！。.]?$/i;
  const ratingFollowUp =
    /^(?:(?:那)?[他她]的?\s*|(?:what about |and )?(?:their|his|her)\s+)(?:ETX|SIP)\b/i.test(
      question.trim(),
    );
  const target =
    (ratingFollowUp ? playerTarget(previous) : null) ??
    playerTarget(question) ??
    (followUp.test(question.trim()) ? playerTarget(previous) : null);
  if (!target || !addressableUsername(target)) return null;
  return readOnlyData(async () => {
    const id = /^[1-9]\d*$/.test(target)
      ? Number(target)
      : (await databaseUsernameOwner(target))?.osuId;
    if (!id || !Number.isSafeInteger(id)) return null;
    let data: Awaited<ReturnType<typeof publishedPlayerProfile>>;
    try {
      // Reuse the public profile loader with saved data and no viewer grants.
      data = await publishedPlayerProfile(
        String(id),
        "osu",
        undefined,
        undefined,
        true,
        undefined,
        undefined,
        true,
      );
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
    if (!data.participation.length) return null;

    const competition = await playerCompetitionRecord(data.participation);
    const profile = data.snapshot?.profile;
    const ratings = data.ratings;
    const participation = data.participation.map((row) => ({
      edition: row.editionName,
      editionSlug: row.editionSlug,
      nameInEdition: row.username,
      participation: row.participation,
      team: row.team?.name,
      coachedTeams: row.coachedTeams?.map((team) => team.name),
      captain: row.captain,
      tier: row.tier,
      placement: row.placingRange ?? row.placing,
    }));
    return {
      title: data.identity.username,
      url: `/players/${id}`,
      text: JSON.stringify({
        category: "OCLR public player profile",
        osuId: id,
        username: data.identity.username,
        publicAliases: data.identity.names.map((name) => name.username),
        selectedEdition: edition.name,
        selectedEditionParticipation: participation.filter(
          (row) => row.editionSlug === edition.slug,
        ),
        otherPublishedParticipation: participation.filter(
          (row) => row.editionSlug !== edition.slug,
        ),
        publishedTeamResults: competition.editions
          .filter((record) => !record.unavailable && record.matches.length)
          .map((record) => ({
            edition: record.editionName,
            editionSlug: record.editionSlug,
            finish: record.finish?.label,
            matches: record.matches.length,
            wins: record.matches.filter((match) => match.outcome === "win")
              .length,
            losses: record.matches.filter((match) => match.outcome === "loss")
              .length,
            draws: record.matches.filter((match) => match.outcome === "draw")
              .length,
          })),
        savedOsuProfile: profile && {
          fetchedAt: profile.fetchedAt,
          country: profile.countryName ?? profile.countryCode,
          globalRank: profile.statistics.globalRank,
          countryRank: profile.statistics.countryRank,
          pp: profile.statistics.pp,
          accuracy: profile.statistics.accuracy,
        },
        publishedRatings: ratings && {
          otr: ratings.otr && {
            value: ratings.otr.value,
            fetchedAt: ratings.otr.fetchedAt,
          },
          sip: ratings.sip.api && {
            value: ratings.sip.api.value,
            fetchedAt: ratings.sip.api.fetchedAt,
            ...(/\bSIP\b/i.test(question + " " + previous) && {
              snapshot: ratings.sip.api.snapshot,
            }),
          },
          s11SipImport: ratings.sip.csv,
          etx: ratings.etx,
        },
      }),
    };
  });
}
