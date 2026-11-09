import type { publicMappools } from "../../src/lib/mappool-reads";

type Pool = Awaited<ReturnType<typeof publicMappools>>[number];
const date = new Date("2026-11-04T00:00:00Z");

export const syntheticPublicPools: Pool[] = [0, 1].map((index) => ({
  id: `pool-${index + 1}`,
  roundId: "round-exhibition",
  name: `Exhibition ${index + 1}`,
  roundName: "Exhibition",
  roundPosition: 1,
  stage: "exhibition",
  fmMode: "free_mod",
  fmRestrictions: "Synthetic restriction: HD or HR",
  publishedAt: date,
  updatedAt: date,
  entries: (["NM", "NM", "HD", "DT", "FM", "TB"] as const).map(
    (category, offset) => ({
      id: `entry-${index}-${offset}`,
      poolId: `pool-${index + 1}`,
      category,
      position: offset === 1 ? 2 : 1,
      beatmapId: 880000 + index * 10 + offset,
      source: null,
      metadata: {
        title:
          offset === 0
            ? `Synthetic ${index + 1}: A Very Long Song Title With UnbrokenTextForNarrowScreensAndKeyboardNavigation`
            : `Synthetic ${index + 1} song ${offset + 1}`,
        artist: "Synthetic artist with a long authored name",
        difficulty: "Synthetic Expert Difficulty With Long Credits",
        mapper: "Synthetic mapper with a long authored name",
        setId: offset === 1 ? 0 : 12345,
        mode: "osu",
        stars: 6.5 - offset * 0.2,
        bpm: 180,
        duration: 194,
        cs: 4,
        ar: 9.5,
        od: 8.5,
        hp: 6,
        ...(category === "DT"
          ? {
              attributes: {
                configuration: "DT",
                ruleset: "osu",
                mods: ["DT"],
                stars: 7.12,
                maxCombo: 1234,
                values: { approach_rate: 10.3 },
                fetchedAt: date.toISOString(),
              },
            }
          : {}),
      },
    }),
  ),
}));
