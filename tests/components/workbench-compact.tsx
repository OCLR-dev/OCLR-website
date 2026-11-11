import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SelectionWorkbench } from "../../src/components/mappool-workbench";
import type { SelectionWorkspace } from "../../src/lib/mappool-workbench-reads";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "zh-Hant";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.appearance = "default";
const date = new Date("2026-01-01T00:00:00Z");
const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
} as AppRouterInstance;
const data: SelectionWorkspace = {
  archived: false,
  asOf: date,
  rounds: [
    { id: "round", name: "Grand Final", stage: "knockout", position: 1 },
    ...(params.has("multipleRounds")
      ? [
          {
            id: "round-extra",
            name: "Synthetic Extended Round Name",
            stage: "knockout" as const,
            position: 2,
          },
        ]
      : []),
  ],
  candidates: [1, 2].map((id) => ({
    id: `candidate-${id}`,
    category: "unassigned",
    beatmapId: 5722290 + id,
    roundIds: params.has("unassignedRounds")
      ? []
      : params.has("multipleRounds")
        ? ["round-extra", "round"]
        : ["round"],
    skillsetTags: ["jump", "tech"],
    skillsetVersion: 1,
    authorId: 1,
    authorName: "Synthetic Pooler With A Long Name",
    createdAt: new Date("2025-12-31T10:25:00Z"),
    metadataFetchedAt: date,
    commentCount: 0,
    metadata: {
      title: "Decensus Ad Nihilum (feat. kahoca from Empty old City)",
      artist: "Crywolf",
      mapper: "Super Creek",
      difficulty: 'Crystal\'s "Ex Nihilo Ad Nihilum"',
      setId: 12345,
      mode: "osu",
      stars: 6.9,
      bpm: 155,
      duration: 202,
      cs: 4.4,
      ar: 9.6,
      od: 9.3,
      hp: 6,
    },
  })),
};
createRoot(document.getElementById("root")!).render(
  <AppRouterContext value={router}>
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : locale === "zh-Hans" ? hans : hant}
      timeZone="UTC"
    >
      <main
        className="themed-site private-site"
        style={{
          padding: 16,
          maxWidth: params.has("narrow") ? 800 : undefined,
        }}
      >
        <SelectionWorkbench
          slug="synthetic"
          initialData={data}
          writable={!params.has("readOnly")}
          viewerId={1}
          officialPools={
            params.has("readOnly")
              ? null
              : { rounds: [], pools: [], entries: [] }
          }
        />
      </main>
    </NextIntlClientProvider>
  </AppRouterContext>,
);
