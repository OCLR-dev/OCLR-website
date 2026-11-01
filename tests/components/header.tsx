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
import "../../src/app/archive-counts.css";
import "../../src/app/header-mobile.css";
import { useState } from "react";
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
    <main style={{ minHeight: 2600, padding: 24 }}>
      <h1>Synthetic header preview</h1>
      <a href="#content">Page content</a>
      <button type="button" data-route-change onClick={() => setPath("/news")}>
        Synthetic route change
      </button>
    </main>
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
                        username: "Synthetic Staff",
                        staff: user === "staff",
                      }
                    : null
                }
                remote={params.has("remote")}
                themePreference={theme}
                systemTheme={theme}
                appearance={appearance}
              />
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
            </div>
          </NextIntlClientProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
