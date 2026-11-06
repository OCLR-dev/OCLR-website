import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import "../../src/app/pastel-theme.css";
import "../../src/app/swiss-theme.css";
import "../../src/app/clay-theme.css";
import "../../src/app/manga-theme.css";
import "../../src/app/glass-theme.css";
import "../../src/app/esports-theme.css";
import "../../src/app/arcade-theme.css";
import "../../src/app/frutiger-theme.css";
import "../../src/app/skyline-theme.css";
import "../../src/app/glacier-theme.css";
import "../../src/app/sakura-theme.css";
import "../../src/app/graphite-theme.css";
import "../../src/app/orbital-theme.css";
import "../../src/app/prism-theme.css";
import "../../src/app/azure-theme.css";
import "../../src/app/verdant-theme.css";
import "../../src/app/chromatic-theme.css";
import "../../src/app/frost-theme.css";
import "../../src/app/nebula-theme.css";
import "../../src/app/archive-counts.css";
import "../../src/app/header-mobile.css";
import "../../src/app/content-layout.css";
import { useState } from "react";
import { EventPlayers } from "../../src/components/event-players";
import { SeasonCountdown } from "../../src/components/season-countdown";
import "../../src/app/tournaments/[edition]/event-pages.css";
import "../../src/app/home.css";
import { TournamentShell } from "../../src/components/tournament-navigation";
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
import { Header } from "../../src/components/header";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
const params = new URLSearchParams(location.search);
const locale = (params.get("locale") || "zh-Hant") as
  "zh-Hant" | "zh-Hans" | "en";
const theme = params.get("theme") === "dark" ? "dark" : "light";
const appearance = (params.get("appearance") || "default") as Parameters<
  typeof Header
>[0]["appearance"];
const user = params.get("user");
document.documentElement.lang = locale;
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.appearance = appearance;
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
};
function Harness() {
  const [path, setPath] = useState(
    params.has("tournament") ? "/tournaments/synthetic" : "/",
  );
  const content = (
    <div
      className={
        params.has("alignment") && !params.has("tournament")
          ? "container page"
          : undefined
      }
      style={{ minHeight: 2600, padding: params.has("alignment") ? 0 : 24 }}
    >
      <h1>Synthetic header preview</h1>
      {params.has("typography") && (
        <>
          <EventPlayers
            remote
            preview
            edition="synthetic"
            players={[
              {
                id: 1,
                name: "中文選手",
                team: null,
                captain: false,
                rank: 12345,
                pp: 4000,
                bio: "中文自我介紹，確認小字保持清晰。",
                messages: [{ author: "合成資料", text: "中文留言內容" }],
              },
            ]}
          />
          <div className="news-list">
            <article>
              <div>
                <p className="muted small">
                  <time dateTime="2026-10-22T00:00:00+08:00">
                    2026/10/22 00:00 (UTC+8)
                  </time>
                </p>
              </div>
              <div>
                <h2>新聞標題</h2>
              </div>
            </article>
          </div>
          <SeasonCountdown
            registration={{
              opensAt: "2026-11-26T20:00:00+08:00",
              closesAt: "2026-11-30T20:00:00+08:00",
              opensLabel: "2026年11月26日 20:00 (UTC+8)",
              closesLabel: "2026年11月30日 20:00 (UTC+8)",
            }}
            state="upcoming"
            initialNow={Date.parse("2026-11-01T12:00:00Z")}
          />
        </>
      )}
      <a href="#content">Page content</a>
      <button type="button" data-route-change onClick={() => setPath("/news")}>
        Synthetic route change
      </button>
      {params.has("home") && (
        <button type="button" data-route-home onClick={() => setPath("/")}>
          Return home
        </button>
      )}
    </div>
  );
  return (
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={path}>
        <SearchParamsContext.Provider value={params}>
          <NextIntlClientProvider
            locale={locale}
            messages={{ en, "zh-Hans": hans, "zh-Hant": hant }[locale]}
            timeZone="UTC"
          >
            <div className="themed-site public-site">
              <Header
                user={
                  user
                    ? {
                        osuId: 1,
                        username: params.get("username") || "Synthetic Staff",
                        staff: user === "staff",
                      }
                    : null
                }
                remote={params.has("remote")}
                themePreference={theme}
                systemTheme={theme}
                appearance={appearance}
              />
              <main
                id="main"
                className={
                  params.has("home") && path === "/"
                    ? "home-redesign"
                    : undefined
                }
              >
                {params.has("tournament") ? (
                  <TournamentShell
                    slug="synthetic"
                    name="Synthetic Cup"
                    liveDraft={false}
                  >
                    {content}
                  </TournamentShell>
                ) : (
                  content
                )}
              </main>
            </div>
          </NextIntlClientProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
