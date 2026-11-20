import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { MappoolEditor } from "../../src/components/mappool-editor";
import type { MappoolWorkspace } from "../../src/lib/mappool-reads";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import "../../src/app/pastel-theme.css";
const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "en";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.appearance =
  params.get("appearance") ?? "default";
const date = new Date("2026-01-01T00:00:00Z");
const data: MappoolWorkspace = {
  showcaseStreamers: params.has("showcase")
    ? [{ osuId: 1100, username: "Synthetic Streamer" }]
    : undefined,
  rounds: [
    {
      id: "round",
      name: "Synthetic round",
      stage: params.has("exhibition") ? "exhibition" : "group",
      position: 1,
      version: 1,
    },
  ],
  pools: [
    {
      id: "pool",
      name: "Synthetic pool",
      roundId: "round",
      fmMode: null,
      fmRestrictions: "",
      version: 7,
      publishedAt: params.has("published") ? date : null,
      lockedAt: params.has("completed") ? date : null,
      selectionLockedAt: params.has("locked") ? date : null,
      showcaseAt: null,
      showcaseGrants: params.has("showcase-grant")
        ? [{ osuId: 1101, username: "Existing Streamer" }]
        : undefined,
      updatedAt: date,
    },
  ],
  entries: Array.from(
    { length: params.has("large-pool") ? 51 : 2 },
    (_, index) => index + 1,
  ).map((position) => ({
    id: `entry-${position}`,
    poolId: "pool",
    category: "NM",
    position,
    beatmapId: 100 + position,
    source: null,
    metadataFetchedAt: date,
    metadata: {
      artist: "Synthetic artist",
      title: `Synthetic map ${position}`,
      difficulty: "Extra",
      mapper: "Synthetic mapper",
      setId: 0,
      mode: "osu",
      stars: 6.01,
      bpm: 185,
      duration: 295,
      ar: 9.3,
      od: 8.8,
      cs: 4,
      hp: 5,
      attributes: {
        configuration: "NM",
        mods: [],
        stars: 6.01,
        ruleset: "osu",
        maxCombo: 1200,
        values: { aim_difficulty: 3.152, speed_difficulty: 2.663 },
        fetchedAt: date.toISOString(),
      },
    },
  })),
};
function Fixture() {
  const [workspace, setWorkspace] = useState(data);
  const savedPublication = useRef<{ published: boolean } | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      savedPublication.current = (
        event as CustomEvent<{ published: boolean }>
      ).detail;
    };
    window.addEventListener("synthetic-pool-publication", receive);
    return () =>
      window.removeEventListener("synthetic-pool-publication", receive);
  }, []);
  const router: AppRouterInstance = {
    back() {},
    forward() {},
    refresh() {
      const saved = savedPublication.current;
      if (!saved) return;
      savedPublication.current = null;
      setWorkspace((previous) => ({
        ...previous,
        pools: previous.pools.map((pool) => ({
          ...pool,
          publishedAt: saved.published ? date : null,
          version: pool.version + 1,
        })),
      }));
    },
    push() {},
    replace() {},
    prefetch() {},
    bfcacheId: "synthetic",
  };
  return (
    <AppRouterContext.Provider value={router}>
      <NextIntlClientProvider
        locale={locale}
        messages={
          locale === "zh-Hant" ? hant : locale === "zh-Hans" ? hans : en
        }
        timeZone="UTC"
      >
        <main className="themed-site private-site" style={{ padding: 16 }}>
          <MappoolEditor
            slug="synthetic"
            data={workspace}
            readOnlyMaps={params.has("readonly")}
            canManageReplays={params.has("manage")}
            canPlayReplays={params.has("cache")}
            canConfigureShowcase={params.has("showcase")}
            suggesters={
              params.has("suggesters")
                ? {
                    mappoolers: [
                      { osuId: 1100, username: "Synthetic Mappooler" },
                    ],
                    candidates: [
                      {
                        candidateId: "5f994ec4-06be-48ab-a56c-5f3fbb5eca0c",
                        beatmapId: 101,
                        category: "NM",
                        osuId: 1101,
                        username: "Synthetic Candidate Author",
                      },
                    ],
                    saved: [],
                  }
                : undefined
            }
          />
        </main>
      </NextIntlClientProvider>
    </AppRouterContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
