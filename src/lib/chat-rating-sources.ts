import type { ChatSource } from "./chat-retrieval";
import type { ProfileRatings } from "./profile-ratings-model";

const modCodes = new Map([
  ["nomod", "NM"],
  ["hidden", "HD"],
  ["hardrock", "HR"],
  ["doubletime", "DT"],
  ["freemod", "FM"],
]);

export function playerRatingSources(
  username: string,
  url: string,
  ratings: Pick<ProfileRatings, "etx" | "sip">,
): ChatSource[] {
  const sources: ChatSource[] = [];
  const etx = ratings.etx;
  if (etx?.mods && Object.keys(etx.mods).length) {
    sources.push({
      url,
      title: username + " · ETX MOD",
      text: JSON.stringify({
        username,
        provider: "ETX",
        unit: "stars",
        source: etx.source,
        scope: "current public profile",
        provisional: etx.provisional,
        outdated: etx.outdated,
        mods: etx.mods,
      }),
    });
  }
  const api = ratings.sip.api;
  if (!api?.snapshot) return sources;
  const { rating, modifications, skillsets } = api.snapshot;
  const groups = {
    overall: rating ? { overall: rating } : {},
    MOD: modifications,
    skillset: skillsets,
  };
  for (const [group, entries] of Object.entries(groups)) {
    for (const [label, entry] of Object.entries(entries ?? {})) {
      const mod =
        group === "MOD"
          ? modCodes.get(label.toLowerCase().replace(/\s/g, ""))
          : undefined;
      const category = mod ? `${label} (${mod})` : label;
      sources.push({
        url,
        title: `${username} · SIP ${group} · ${category}`,
        text: JSON.stringify({
          username,
          provider: "SIP",
          group,
          label,
          mod,
          scope: "current public profile",
          value: entry.value,
          sr: entry.sr,
          pp: entry.pp,
          globalRank: entry.globalRank,
          countryRank: entry.countryRank,
          modelAccuracyShare: entry.accuracy,
          modelComboShare: entry.combo,
        }),
      });
    }
  }
  return sources;
}
