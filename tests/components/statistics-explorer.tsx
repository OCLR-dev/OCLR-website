import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { StatisticsExplorer } from "../../src/components/statistics-explorer";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { projectStatistics } from "../../src/lib/archive-statistics-model";
import en from "../../messages/en.json";

const data = {
  slug: "synthetic",
  archiveKey: "synthetic",
  matchDetails: [],
  poolFixtures: undefined,
  publishedAt: null,
  mpTotal: 1,
  mpCovered: 1,
  players: statisticsArchive.players,
  teams: statisticsArchive.teams,
  stages: ["Final", "Semi"],
  plays: projectStatistics(statisticsArchive, "one", {
    archiveKey: "synthetic",
    source: statisticsSource(),
    poolId: "final",
    included: [1, 2],
  }),
  fixtures: [
    {
      id: "one",
      label: "Synthetic Final",
      stage: "Final",
      covered: true,
      technicalAdjudication: true,
      score: [2, 0],
    },
    {
      id: "uncovered",
      label: "Synthetic Semi",
      stage: "Semi",
      covered: false,
      technicalAdjudication: false,
      score: null,
    },
  ],
} as Parameters<typeof StatisticsExplorer>[0]["data"];

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <StatisticsExplorer data={data} />
  </NextIntlClientProvider>,
);
