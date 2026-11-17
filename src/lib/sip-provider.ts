import { z } from "zod";

const ratingResponse = z.object({
  playerId: z.int().positive(),
  rating: z.object({ value: z.number() }).nullable(),
});

export async function fetchSipRating(osuId: number, token: string) {
  if (!Number.isSafeInteger(osuId) || osuId < 1)
    throw new Error("Invalid osu! ID.");

  const response = await fetch(`https://skillissue.app/ratings/${osuId}`, {
    headers: { source: token, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    // Release the connection without reading or logging error payloads.
    void response.body?.cancel().catch(() => {});
    if (response.status === 404)
      return { kind: "rating", value: null } as const;
    if (response.status === 401 || response.status === 403)
      return { kind: "unauthorized" } as const;
    if (response.status === 429) return { kind: "rate-limited" } as const;
    throw new Error("Skill Issue rating request failed.");
  }

  const parsed = ratingResponse.safeParse(await response.json());
  if (!parsed.success || parsed.data.playerId !== osuId)
    throw new Error("Skill Issue returned an invalid rating.");

  return { kind: "rating", value: parsed.data.rating?.value ?? null } as const;
}
