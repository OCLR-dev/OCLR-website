import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { FixtureManager } from "../../src/components/fixture-manager";
import type { FixtureWorkspace } from "../../src/lib/fixture-reads";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rounds = (["knockout", "group", "exhibition"] as const).map(
  (stage, i) => ({
    stage,
    round: {
      id: id(i + 1),
      editionSlug: "synthetic",
      stageId: id(i + 10),
      name: stage,
      position: i + 1,
      version: 0,
      scoringRules: null,
      standingsRules: null,
      updatedAt: new Date("2026-01-01"),
    },
  }),
);
const source = {
  id: id(100),
  editionSlug: "synthetic",
  roundId: id(1),
  label: "Synthetic source",
  homeTeamId: null,
  awayTeamId: null,
  exhibitionSides: undefined,
  scheduledAt: null,
  timeZone: "UTC",
  status: "scheduled" as const,
  mappoolId: null,
  position: 1,
  homeSourceId: null,
  homeSourceOutcome: null,
  awaySourceId: null,
  awaySourceOutcome: null,
  publishedAt: null,
  assignmentRevision: 0,
  streamRevision: 0,
  version: 0,
  updatedAt: new Date("2026-01-01"),
  referees: [],
  refereeIds: [],
  result: null,
};
const data: FixtureWorkspace = {
  eligibleReferees: [],
  stages: [],
  canManage: true,
  canViewAll: true,
  timeZone: "UTC",
  fixtures: [
    source,
    {
      ...source,
      id: id(101),
      label: "Synthetic target",
      position: 2,
      homeSourceId: source.id,
      homeSourceOutcome: "winner",
      awaySourceId: source.id,
      awaySourceOutcome: "loser",
    },
  ],
  rounds,
  teams: [],
  pools: [],
};
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
    <SearchParamsContext.Provider value={new URLSearchParams()}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <main className="container themed-site private-site">
          <FixtureManager slug="synthetic" data={data} />
        </main>
      </NextIntlClientProvider>
    </SearchParamsContext.Provider>
  </AppRouterContext.Provider>,
);
