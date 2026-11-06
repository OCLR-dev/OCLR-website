import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PublicMappools } from "../../src/components/public-mappools";
import { MappoolBrowser } from "../../src/components/mappool-browser";
import { ArchiveMappools } from "../../src/components/archive-mappools";
import { PageHeading } from "../../src/components/ui";
import { syntheticPublicPools } from "../fixtures/public-mappools";
import { legacyS5Mappool } from "../fixtures/legacy-s5-mappool";
import { archivePoolMetadata } from "../../src/lib/archive-map-metadata";
import { correctS2PoolArchive } from "../../src/lib/archive-pool-correction-model";
import earlyInventory from "../../docs/imports/early-season-mappools.json";
import s6Files from "../../src/data/archive-file-supplements.json";
import { baseDifficulty } from "../../src/lib/difficulty-display";
import {
  difficultyMods,
  type DifficultyConfiguration,
  type DifficultySnapshot,
} from "../../src/lib/mappool-model";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/skyline-theme.css";
import "../../src/app/glacier-theme.css";
import "../../src/app/sakura-theme.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "en";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.appearance =
  params.get("appearance") ?? "default";
const messages = locale === "en" ? en : locale === "zh-Hans" ? hans : hant;
const earlySeason = (params.get("early-season") ??
  "s1") as keyof typeof earlyInventory.seasons;
// Fixture preparation represents the corrected persisted archive, not a display filter.
const earlyPools = params.has("early-season")
  ? earlySeason === "s2"
    ? correctS2PoolArchive({
        editionSlug: "s2",
        pools: earlyInventory.seasons.s2,
      }).pools
    : earlyInventory.seasons[earlySeason]
  : null;
const earlyPool = earlyPools?.find(
  (pool) => pool.id === (params.get("pool") ?? "gs"),
);
const recoveredS6 = params.has("s6-file")
  ? archivePoolMetadata(
      {
        id: "captain-qualifier",
        name: "Synthetic qualifier",
        source: "Synthetic source",
        maps: [
          {
            slot: "NM3",
            beatmapId: 2314568,
            title: s6Files.s6[0].attributes.title,
            mapper: "HeTo",
            stars: 6.35,
            bpm: 209,
            drainSeconds: 216,
            cs: null,
            ar: null,
            od: null,
            source: "Synthetic saved map",
          },
        ],
      },
      "s6",
    )
  : null;
const legacy =
  recoveredS6 ??
  (earlyPool
    ? archivePoolMetadata(earlyPool, earlySeason)
    : params.has("legacy-s5")
      ? archivePoolMetadata(legacyS5Mappool, "s5")
      : null);
type Pool = (typeof syntheticPublicPools)[number];
const difficultyPools: Pool[] = syntheticPublicPools.map((pool) => ({
  ...pool,
  entries: pool.entries.map((e) => ({
    ...e,
    metadata: {
      ...e.metadata,
      difficultySnapshot: {
        beatmapId: e.beatmapId,
        ruleset: "osu",
        checksum: null,
        fetchedAt: "2026-11-05T00:00:00.000Z",
        base: baseDifficulty(e.metadata),
        variants: Object.fromEntries(
          (e.category === "FM"
            ? ["HD", "HR", "EZ"]
            : e.category === "DT"
              ? ["DT"]
              : []
          ).map((configuration, i) => [
            configuration,
            {
              configuration,
              mods: difficultyMods[configuration as DifficultyConfiguration],
              ruleset: "osu",
              stars: e.category === "DT" ? 7.12 : [5.8, 6.8, 3.1][i],
              maxCombo: 1000,
              values: {},
              fetchedAt: "2026-11-05T00:00:00.000Z",
            },
          ]),
        ),
      } as DifficultySnapshot,
    },
  })),
}));
if (params.has("missing-variants") || params.has("no-snapshot"))
  for (const pool of difficultyPools)
    for (const entry of pool.entries) {
      if (params.has("no-snapshot")) delete entry.metadata.difficultySnapshot;
      if (!params.has("missing-variants")) continue;
      delete entry.metadata.attributes;
      if (entry.metadata.difficultySnapshot)
        entry.metadata.difficultySnapshot.variants = {};
    }
const pools = params.has("difficulty")
  ? difficultyPools
  : params.has("single")
    ? syntheticPublicPools
        .slice(0, 1)
        .map((pool) => ({ ...pool, roundName: pool.name }))
    : params.has("duplicates")
      ? syntheticPublicPools.map((pool, index) => ({
          ...pool,
          name: "Shared authored name",
          roundName: index ? "Final round" : "Group round",
          stage: index ? ("knockout" as const) : ("group" as const),
        }))
      : syntheticPublicPools;
const translated = (english: string) =>
  english === "Mappools" ? (locale === "en" ? "Mappools" : "圖池") : english;

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
    <main
      className="themed-site public-tournament"
      style={{ padding: "24px 16px", maxWidth: 1280, margin: "0 auto" }}
    >
      <PageHeading title={translated("Mappools")} />
      {params.has("archive") ? (
        <div className="historical-archive">
          <ArchiveMappools
            pool={
              params.has("difficulty")
                ? {
                    id: "archive",
                    name: "Synthetic archive",
                    source: "Synthetic browser fixture",
                    maps: difficultyPools[0].entries
                      .filter((e) => ["DT", "FM"].includes(e.category))
                      .map((e) => ({
                        slot: `${e.category}1`,
                        beatmapId: e.beatmapId,
                        title: e.metadata.title,
                        mapper: e.metadata.mapper,
                        stars: 8.8,
                        bpm: 270,
                        drainSeconds: 80,
                        cs: 4,
                        ar: 9,
                        od: 8.5,
                        source: "Synthetic browser fixture",
                        difficultySnapshot: e.metadata.difficultySnapshot,
                      })),
                  }
                : (legacy?.pool ?? {
                    id: "archive",
                    name: "Synthetic archive",
                    source: "Synthetic browser fixture",
                    maps: [
                      {
                        slot: "NM1",
                        beatmapId: 880000,
                        title:
                          "Synthetic artist - Synthetic archive song [Expert] (Synthetic mapper)",
                        mapper: "Synthetic mapper",
                        stars: 6.5,
                        bpm: 180,
                        drainSeconds: 194,
                        cs: 4,
                        ar: 9.5,
                        od: 8.5,
                        source: "Synthetic browser fixture",
                      },
                    ],
                  })
            }
            artworkSetIds={legacy?.setIds ?? {}}
            missingBeatmapIds={legacy?.missingBeatmapIds}
            stages={
              earlyPools?.map((pool) => ({
                id: pool.id,
                name: pool.name,
                count: pool.maps.length,
                href: `/public-mappools?archive&early-season=${earlySeason}&pool=${pool.id}`,
              })) ?? [
                {
                  id: "archive",
                  name: "Synthetic archive",
                  count: 1,
                  href: "#archive",
                },
              ]
            }
          />
        </div>
      ) : params.has("detail") ? (
        <MappoolBrowser slug="synthetic" pool={pools[0]} />
      ) : (
        <PublicMappools slug="synthetic" pools={pools} />
      )}
    </main>
  </NextIntlClientProvider>,
);
