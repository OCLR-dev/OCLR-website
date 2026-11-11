import "server-only";

import { z } from "zod";
import { RemotePublicCache } from "./remote-public-cache";

const origin = "https://otr.stagec.net";
const standardRuleset = 0;
const ratings = new RemotePublicCache();
const directoryRatings = new RemotePublicCache();
const playerStats = z.object({
  playerInfo: z.object({ id: z.int().positive(), osuId: z.int().positive() }),
  ruleset: z.literal(standardRuleset),
  rating: z
    .object({ ruleset: z.literal(standardRuleset), rating: z.number() })
    .nullable(),
});

export type OtrRating = {
  value: number;
  fetchedAt: string;
  profileUrl: string;
};

export async function getOtrRating(osuId: number): Promise<OtrRating | null> {
  const key = process.env.OTR_API_KEY?.trim();
  if (!key) return null;

  // Cache only the public projection. The key and the provider's raw stats
  // response never enter the cache or the page props.
  return ratings
    .read(String(osuId), async () => {
      const url = new URL(`/api/players/${osuId}/stats`, origin);
      url.searchParams.set("keyType", "osu");
      url.searchParams.set("ruleset", String(standardRuleset));
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(2000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("o!TR rating request failed");

      const stats = playerStats.parse(await response.json());
      if (stats.playerInfo.osuId !== osuId)
        throw new Error("o!TR returned a different player");
      if (!stats.rating) return null;

      return {
        value: stats.rating.rating,
        fetchedAt: new Date().toISOString(),
        // The public website resolves numeric paths by o!TR ID first.
        profileUrl: `${origin}/players/${stats.playerInfo.id}?ruleset=${standardRuleset}`,
      };
    })
    .catch(() => null);
}

export async function getDirectoryOtrRatings(osuIds: number[]) {
  if (!process.env.OTR_API_KEY?.trim()) return {};
  const ids = [...new Set(osuIds)].sort((a, b) => a - b);

  // Share an in-flight directory lookup across visitors and keep it cached even
  // when the roster exceeds the individual profile cache's capacity.
  return directoryRatings.read(ids.join(","), async () => {
    const values: Record<number, number> = {};
    const batchSize = 6;
    for (let offset = 0; offset < ids.length; offset += batchSize) {
      await Promise.all(
        ids.slice(offset, offset + batchSize).map(async (id) => {
          const rating = await getOtrRating(id);
          if (rating) values[id] = rating.value;
        }),
      );
    }
    return values;
  });
}
