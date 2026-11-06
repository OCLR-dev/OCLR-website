// Design review only: real page components with isolated synthetic records.
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
import { TournamentShell } from "../../src/components/tournament-navigation";
import { EventArtwork } from "../../src/components/event-artwork";
import { PageHeading } from "../../src/components/ui";
import { PublicMappools } from "../../src/components/public-mappools";
import { PlayerTimeline } from "../../src/components/player-timeline";
import { buildPlayerTimeline } from "../../src/lib/player-timeline";
import { syntheticPublicPools } from "../fixtures/public-mappools";
import { useAppTranslations } from "../../src/i18n/shared";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import "../../src/app/header-mobile.css";
import "../../src/app/content-layout.css";
import "../../src/app/tournaments/[edition]/event-pages.css";
import "../../src/app/nebula-theme.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") || "zh-Hant";
const appearance =
  params.get("appearance") === "default" ? "default" : "nebula-bloom";
document.documentElement.lang = locale;
document.title = "OCLR S11 · Synthetic theme preview";
document.documentElement.dataset.theme = params.get("theme") || "light";
document.documentElement.dataset.appearance = appearance;
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic-s11",
};
const timeline = buildPlayerTimeline({
  editions: [],
  editionPool: [{ season: "11", slug: "synthetic-s11" }],
  now: new Date("2026-12-01T00:00:00Z"),
});
function Preview() {
  const tr = useAppTranslations();
  return (
    <div className="themed-site site-shell">
      <Header
        user={null}
        themePreference={params.get("theme") === "dark" ? "dark" : "light"}
        systemTheme={params.get("theme") === "dark" ? "dark" : "light"}
        appearance={appearance}
        defaultAppearance={appearance}
      />
      <main className="public-tournament">
        <TournamentShell slug="synthetic-s11" name="OCLR S11" liveDraft={false}>
          <PageHeading eyebrow="OCLR S11" title={tr("Pools")}>
            Synthetic design preview · 合成設計樣本；非正式賽事資料
          </PageHeading>
          <EventArtwork src="/oclr-s11-key-visual.webp" name="OCLR S11" />
          <section
            style={{ marginBlock: 32 }}
            aria-label={tr("Player timeline")}
          >
            <PlayerTimeline timeline={timeline} />
          </section>
          <PublicMappools slug="synthetic-s11" pools={syntheticPublicPools} />
        </TournamentShell>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <AppRouterContext.Provider value={router}>
    <PathnameContext.Provider value="/tournaments/synthetic-s11/mappools">
      <SearchParamsContext.Provider value={params}>
        <NextIntlClientProvider
          locale={locale}
          messages={locale === "en" ? en : locale === "zh-Hans" ? hans : hant}
          timeZone="UTC"
        >
          <Preview />
        </NextIntlClientProvider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  </AppRouterContext.Provider>,
);
