import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { PlayerPractice } from "../../src/components/player-practice";
import { TournamentShell } from "../../src/components/tournament-navigation";
import { PageHeading } from "../../src/components/ui";
import { Header } from "../../src/components/header";
import { useAppTranslations } from "../../src/i18n/shared";
import type { PracticeWorkspace } from "../../src/lib/player-workspace";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import "../../src/app/header-mobile.css";
const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "en";
const theme = params.get("theme") === "dark" ? "dark" : "light";
const first = "67800000-0000-4000-8000-000000000001",
  second = "67800000-0000-4000-8000-000000000002";
const actor = { osuId: 678001, username: "Synthetic Player" },
  teammate = { osuId: 678002, username: "Synthetic Teammate" };
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push(url) {
    window.dispatchEvent(
      new CustomEvent("synthetic-pool", {
        detail: new URL(url, location.origin).searchParams.get("pool"),
      }),
    );
  },
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
};
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.appearance = "default";
function workspace(poolId: string): PracticeWorkspace {
  const one = poolId === first;
  return {
    actorId: actor.osuId,
    team: {
      id: "67800000-0000-4000-8000-000000000003",
      name: "Synthetic Team",
    },
    participants: [actor, teammate],
    readOnly: params.has("readonly"),
    pools: [
      { id: first, name: "Round 1", roundName: "Round 1", stage: "group" },
      {
        id: second,
        name: "Final Pool",
        roundName: "Round 2",
        stage: "knockout",
      },
    ],
    pool: {
      id: poolId,
      name: one ? "Round 1" : "Final Pool",
      roundName: one ? "Round 1" : "Round 2",
      stage: one ? "group" : "knockout",
      fmMode: null,
      fmRestrictions: "",
      entries: (one ? ["NM", "HD"] : ["HR"]).map((category, index) => ({
        id: `67800000-0000-4000-8000-00000000001${one ? index : 5}`,
        poolId,
        category: category as "NM" | "HD" | "HR",
        position: 1,
        beatmapId: 100 + index,
        context: "a".repeat(64),
        ownVersion: one && index === 0 ? 1 : 0,
        metadata: {
          setId: 1,
          artist: "Synthetic Artist",
          title: `${category} Signal`,
          difficulty: "Synthetic Insane",
          mapper: "Synthetic Mapper",
          stars: 5,
          bpm: 180,
          duration: 120,
        },
        records:
          one && index === 0
            ? [
                {
                  ...actor,
                  userId: actor.osuId,
                  score: 900000,
                  rating: 3,
                  comment: "My saved comment",
                  version: 1,
                  updatedAt: "2026-11-01T12:00:00Z",
                  stale: false,
                },
                {
                  userId: teammate.osuId,
                  score: 950000,
                  rating: 5,
                  comment: params.has("long")
                    ? "合成測試評論WithALongUnbrokenWordABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(
                        3,
                      )
                    : "Visible teammate comment",
                  version: 1,
                  updatedAt: "2026-11-01T12:00:00Z",
                  stale: false,
                },
              ]
            : [],
      })),
    },
  };
}
function Harness() {
  const [pool, setPool] = useState(first);
  const tr = useAppTranslations();
  useEffect(() => {
    const change = (event: Event) =>
      setPool((event as CustomEvent<string>).detail);
    window.addEventListener("synthetic-pool", change);
    return () => window.removeEventListener("synthetic-pool", change);
  }, []);
  return (
    <div className="site-shell themed-site private-site">
      <Header
        user={{ ...actor, staff: false }}
        remote={false}
        themePreference={theme}
        systemTheme={theme}
        appearance="default"
      />
      <TournamentShell
        slug="synthetic"
        name="Synthetic Cup"
        liveDraft={false}
        playerWorkspace
        captainWorkspace={{ scheduleRequests: true }}
      >
        <PageHeading
          eyebrow={tr("PLAYER WORKSPACE")}
          title={tr("Practice sheet")}
        />
        <PlayerPractice slug="synthetic" data={workspace(pool)} />
      </TournamentShell>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <AppRouterContext.Provider value={router}>
    <PathnameContext.Provider value="/tournaments/synthetic/player/practice">
      <SearchParamsContext.Provider value={params}>
        <NextIntlClientProvider
          locale={locale}
          messages={
            locale === "zh-Hant" ? hant : locale === "zh-Hans" ? hans : en
          }
          timeZone="UTC"
        >
          <Harness />
        </NextIntlClientProvider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  </AppRouterContext.Provider>,
);
