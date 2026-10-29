import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { StatisticsManager } from "../../src/components/statistics-manager";
import en from "../../messages/en.json";
import type { StatisticsWorkspace } from "../../src/lib/archive-statistics";
const initial = {
  slug: "synthetic",
  fixtures: [
    {
      id: "A",
      label: "Match A",
      stage: "Final",
      teams: ["A1", "A2"],
      mpIds: [101],
      score: [1, 0],
    },
    {
      id: "B",
      label: "Match B",
      stage: "Final",
      teams: ["B1", "B2"],
      mpIds: [202],
      score: [4, 1],
    },
  ],
  summaries: [],
  pools: [],
  reviews: [],
  blockers: [],
  canPublish: false,
} as unknown as StatisticsWorkspace;
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <StatisticsManager initial={initial} />
  </NextIntlClientProvider>,
);
