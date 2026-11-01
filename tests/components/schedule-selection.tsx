import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PlayerTimetable } from "../../src/components/player-timetable";
import { ScheduleManager } from "../../src/components/schedule-manager";
import type { TimetableWorkspace } from "../../src/lib/player-workspace";
import type { ScheduleWorkspace } from "../../src/lib/schedule";
import en from "../../messages/en.json";
import zhHant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
};
const owner = { osuId: 676001, username: "Synthetic player" };
const intervals = [
  { start: "2026-11-01T10:00:00.000Z", end: "2026-11-01T11:00:00.000Z" },
];
const ownIntervals = params.has("empty-own") ? [] : intervals;
const timetable: TimetableWorkspace = {
  actorId: owner.osuId,
  owner,
  players: [owner],
  teamAvailability: params.has("captain")
    ? [
        {
          userId: owner.osuId,
          username: owner.username,
          intervals: ownIntervals,
        },
        {
          userId: 676002,
          username: "Synthetic teammate",
          intervals: [
            {
              start: "2026-11-01T10:30:00.000Z",
              end: "2026-11-01T12:00:00.000Z",
            },
          ],
        },
        { userId: 676003, username: "Unreported player", intervals: [] },
      ]
    : [],
  timeZone: "Asia/Taipei",
  canEdit: !params.has("readonly"),
  intervals: ownIntervals,
  version: 1,
  updatedAt: null,
};
const schedule: ScheduleWorkspace = {
  admin: false,
  actorId: owner.osuId,
  captain: false,
  ownTeamId: "00000000-0000-4000-8000-000000000001",
  requests: [],
  fixtures: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      label: "Synthetic match",
      roundId: "00000000-0000-4000-8000-000000000003",
      roundName: "Synthetic round",
      version: 1,
      timeZone: "Asia/Taipei",
      scheduledAt: intervals[0].start,
      eligible: true,
      home: "Synthetic home",
      away: "Synthetic away",
      participant: true,
      ownAvailability: { version: 1, intervals },
      roster: [],
      summary: [],
      unreported: 0,
      sameStart: [],
      referees: [],
      commentators: [],
      streamer: null,
    },
  ],
};
createRoot(document.getElementById("root")!).render(
  <AppRouterContext.Provider value={router}>
    <NextIntlClientProvider
      locale={params.has("zh-Hant") ? "zh-Hant" : "en"}
      messages={params.has("zh-Hant") ? zhHant : en}
      timeZone="UTC"
    >
      <main
        className="themed-site private-site"
        style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}
      >
        {params.has("fixture") ? (
          <ScheduleManager slug="synthetic" data={schedule} />
        ) : (
          <PlayerTimetable slug="synthetic" data={timetable} />
        )}
      </main>
    </NextIntlClientProvider>
  </AppRouterContext.Provider>,
);
