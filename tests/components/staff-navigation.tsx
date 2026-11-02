import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { StaffNavigation } from "../../src/components/staff-navigation";
import {
  globalNavigation,
  tournamentNavigation,
} from "../../src/lib/admin-navigation";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";

const params = new URLSearchParams(location.search);
const locale = (params.get("locale") || "en") as "en" | "zh-Hans" | "zh-Hant";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") || "light";
document.documentElement.dataset.appearance = "default";

function Preview() {
  const [pathname, setPathname] = useState(
    params.get("path") || "/admin/tournaments/s11/mappools",
  );
  const router: AppRouterInstance = {
    back() {},
    forward() {},
    refresh() {},
    push: setPathname,
    replace: setPathname,
    prefetch() {},
    bfcacheId: "synthetic",
  };
  return (
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={pathname}>
        <NextIntlClientProvider
          locale={locale}
          messages={{ en, "zh-Hans": hans, "zh-Hant": hant }[locale]}
          timeZone="UTC"
        >
          <div
            className="themed-site private-site"
            onClickCapture={(event) => {
              // Model route changes without starting Next's full browser runtime.
              const link = (event.target as Element).closest("a");
              if (link) {
                event.preventDefault();
                setPathname(link.getAttribute("href")!);
              }
            }}
          >
            <StaffNavigation
              globalLinks={[...globalNavigation]}
              editions={["s11", "test-cup"].map((slug) => ({
                slug,
                name: slug === "s11" ? "OCLR Season 11" : "Synthetic test cup",
                status: "live",
                published: true,
                links: tournamentNavigation.flatMap((group) =>
                  group.items.map((item) => ({
                    href: `/admin/tournaments/${slug}${item.path ? `/${item.path}` : ""}`,
                    label: item.label,
                    group: group.label,
                  })),
                ),
              }))}
              username="Synthetic Staff"
              readOnly={params.has("readOnly")}
            >
              <h1>Workspace content</h1>
              <p data-pathname>{pathname}</p>
              <label className="field">
                Unsaved content
                <input defaultValue="Keep this draft" />
              </label>
            </StaffNavigation>
          </div>
        </NextIntlClientProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
