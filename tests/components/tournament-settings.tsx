import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { TournamentEditor } from "../../src/components/tournament-editor";
import { StaffReadOnlyContext } from "../../src/components/staff-read-only";
import { edition } from "../fixtures/edition";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import "../../src/app/pastel-theme.css";
import "../../src/app/swiss-theme.css";
import "../../src/app/nebula-theme.css";

type Workspace = Parameters<typeof TournamentEditor>[0]["data"];
const params = new URLSearchParams(location.search);
const locale = params.get("locale") || "en";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") || "light";
document.documentElement.dataset.appearance =
  params.get("appearance") || "default";
const initial: Workspace = {
  edition: {
    ...edition,
    coachesEnabled: false,
    branding: {
      logo: "/oclr-s11-square-logo.webp",
      background: "/oclr-s11-website-background.webp",
      keyVisual: "/oclr-s11-key-visual.webp",
    },
  },
  revision: 4,
  applications: 0,
  registrationPaused: false,
  readiness: [],
};
function Fixture() {
  const [data, setData] = useState(initial);
  const saved = useRef<Pick<
    Workspace["edition"],
    "name" | "branding" | "ezScoreMultiplier" | "coachesEnabled"
  > | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const fields = (event as CustomEvent<Workspace["edition"]>).detail;
      saved.current = {
        name: fields.name,
        branding: fields.branding,
        ezScoreMultiplier: fields.ezScoreMultiplier,
        coachesEnabled: fields.coachesEnabled,
      };
    };
    window.addEventListener("synthetic-settings-saved", receive);
    return () =>
      window.removeEventListener("synthetic-settings-saved", receive);
  }, []);
  const router: AppRouterInstance = {
    back() {},
    forward() {},
    push() {},
    replace() {},
    prefetch() {},
    bfcacheId: "synthetic",
    refresh() {
      const fields = saved.current;
      if (!fields) return;
      saved.current = null;
      setData((previous) => ({
        ...previous,
        edition: { ...previous.edition, ...fields },
        revision: previous.revision + 1,
      }));
    },
  };
  return (
    <AppRouterContext.Provider value={router}>
      <SearchParamsContext.Provider value={params}>
        <NextIntlClientProvider
          locale={locale}
          messages={
            locale === "zh-Hans" ? hans : locale === "zh-Hant" ? hant : en
          }
          timeZone="UTC"
        >
          <StaffReadOnlyContext value={params.has("readonly")}>
            <main
              className="themed-site private-site"
              style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}
            >
              <h1>Tournament settings</h1>
              <TournamentEditor data={data} />
            </main>
          </StaffReadOnlyContext>
        </NextIntlClientProvider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
