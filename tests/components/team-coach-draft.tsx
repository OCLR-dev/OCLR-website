import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TeamCoachManager } from "../../src/components/team-coach-manager";
import en from "../../messages/en.json";
const router = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  bfcacheId: "synthetic",
} as AppRouterInstance;
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <AppRouterContext.Provider value={router}>
      <TeamCoachManager
        slug="synthetic"
        version={1}
        teamId="synthetic-team"
        coaches={[{ osuId: 1001, username: "Synthetic Coach" }]}
      />
    </AppRouterContext.Provider>
  </NextIntlClientProvider>,
);
