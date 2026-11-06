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
import { TournamentOverviewContents } from "../../src/components/tournament-overview-contents";
import { EmptyState, PageHeading } from "../../src/components/ui";
import { LiveDraft } from "../../src/components/live-draft";
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
import "../../src/app/tournaments/[edition]/information.css";
import "../../src/app/nebula-theme.css";

const params = new URLSearchParams(location.search);
const timelinePreview = params.get("view") === "timeline";
const teamsPreview = params.get("view") === "teams";
const draftPreview = params.get("view") === "draft";
const schedulePreview = params.get("view") === "schedule";
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
// Match the overview's document/table structure with clearly synthetic dates.
function SchedulePreview() {
  const tr = useAppTranslations();
  return (
    <div className="rules-handbook information-overview-layout">
      <TournamentOverviewContents
        entries={[{ id: "schedule", label: tr("Tournament schedule") }]}
      />
      <div className="information-overview-reading">
        <div className="information-overview-details">
          <article
            className="information-document document-typeset"
            aria-labelledby="schedule-title"
          >
            <section id="schedule" tabIndex={-1}>
              <h2 id="schedule-title">{tr("Tournament schedule")}</h2>
              <div className="information-table-scroll" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{tr("Event")}</th>
                      <th scope="col">
                        {tr("Date ({zone})", { zone: "UTC+8" })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{tr("Registration opens")}</td>
                      <td>2030/01/01 00:00 (UTC+8)</td>
                    </tr>
                    <tr>
                      <td>{tr("Registration closes")}</td>
                      <td>2030/01/31 20:00 (UTC+8)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}
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
          <PageHeading
            eyebrow={
              draftPreview ? tr("THE TEAM STORY STARTS HERE") : "OCLR S11"
            }
            title={
              teamsPreview
                ? tr("Teams")
                : schedulePreview
                  ? tr("Tournament schedule")
                  : draftPreview
                    ? tr("Captain draft")
                    : timelinePreview
                      ? tr("Player timeline")
                      : tr("Pools")
            }
          >
            {draftPreview
              ? tr("Published selections, captain turns and roster progress.")
              : "Synthetic design preview · 合成設計樣本；非正式賽事資料"}
          </PageHeading>
          {schedulePreview ? (
            <SchedulePreview />
          ) : teamsPreview ? (
            <EmptyState title={tr("No teams published")}>
              {tr("Approved team identities will appear here when released.")}
            </EmptyState>
          ) : draftPreview ? (
            <LiveDraft slug="synthetic-s11" initial={null} />
          ) : timelinePreview ? (
            <PlayerTimeline timeline={timeline} />
          ) : (
            <PublicMappools slug="synthetic-s11" pools={syntheticPublicPools} />
          )}
        </TournamentShell>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <AppRouterContext.Provider value={router}>
    <PathnameContext.Provider
      value={`/tournaments/synthetic-s11${schedulePreview ? "" : teamsPreview ? "/teams" : draftPreview ? "/draft" : "/mappools"}`}
    >
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
