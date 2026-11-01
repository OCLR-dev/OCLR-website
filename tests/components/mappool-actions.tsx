import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { MappoolEditor } from "../../src/components/mappool-editor";
import type { MappoolWorkspace } from "../../src/lib/mappools";
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
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
};
const date = new Date("2026-01-01T00:00:00Z");
const data: MappoolWorkspace = {
  rounds: [
    {
      id: "round",
      name: "Synthetic round",
      stage: "group",
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
      publishedAt: null,
      lockedAt: null,
      selectionLockedAt: params.has("locked") ? date : null,
      showcaseAt: null,
      updatedAt: date,
    },
  ],
  entries: [1, 2].map((position) => ({
    id: `entry-${position}`,
    poolId: "pool",
    category: "NM",
    position,
    beatmapId: 100 + position,
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
    },
  })),
};
createRoot(document.getElementById("root")!).render(
  <AppRouterContext.Provider value={router}>
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "zh-Hant" ? hant : locale === "zh-Hans" ? hans : en}
      timeZone="UTC"
    >
      <main className="themed-site private-site" style={{ padding: 16 }}>
        <MappoolEditor
          slug="synthetic"
          data={data}
          readOnlyMaps={params.has("readonly")}
        />
      </main>
    </NextIntlClientProvider>
  </AppRouterContext.Provider>,
);
