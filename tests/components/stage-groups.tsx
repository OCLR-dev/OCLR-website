import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import styles from "../../src/components/team-management.module.css";
import { StageGroups } from "../../src/components/stage-groups";
import { StaffReadOnlyContext } from "../../src/components/staff-read-only";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
const params = new URLSearchParams(location.search);
const locale = params.get("locale") || "en";
document.documentElement.dataset.theme = params.get("theme") || "light";
document.documentElement.dataset.appearance = "default";
document.documentElement.lang = locale;
const names = ["Atlas", "Birch", "Cobalt", "Delta", "Echo"];
const teams = names.map((name, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  name,
  captainId: 100 + index,
  members: [],
  unpublished: index === 4,
}));
const stage = {
  id: "00000000-0000-4000-8000-000000000010",
  version: 7,
  kind: "group",
  groupConfiguration: params.has("saved")
    ? {
        version: "saved-version",
        groups: [
          { key: "g-a", name: "Alpha", teamIds: [teams[0].id, teams[1].id] },
          { key: "g-b", name: "Beta", teamIds: [teams[2].id, teams[3].id] },
        ],
      }
    : null,
  groupsPublishedAt: null,
} as unknown as Parameters<typeof StageGroups>[0]["stage"];
const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
} as AppRouterInstance;
createRoot(document.getElementById("root")!).render(
  <AppRouterContext.Provider value={router}>
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "zh-Hans" ? hans : locale === "zh-Hant" ? hant : en}
      timeZone="UTC"
    >
      <StaffReadOnlyContext value={params.has("readonly")}>
        <div className="themed-site private-site">
          <main className="container">
            <h1>Group assignment</h1>
            <section className={styles.groups}>
              <StageGroups slug="synthetic" stage={stage} data={{ teams }} />
            </section>
          </main>
        </div>
      </StaffReadOnlyContext>
    </NextIntlClientProvider>
  </AppRouterContext.Provider>,
);
