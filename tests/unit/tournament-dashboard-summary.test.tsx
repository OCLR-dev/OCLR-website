import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { TournamentDashboardSummary } from "@/components/tournament-dashboard-summary";
import { english } from "@/i18n/translate";
import type { MappoolWorkspace } from "@/lib/mappool-reads";

afterEach(() => vi.unstubAllGlobals());

it("shows every team and groups every pool in competition round order", () => {
  vi.stubGlobal("React", React);
  const teams = Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1),
    name: `Team ${i + 1}`,
  }));
  const rounds: MappoolWorkspace["rounds"] = [
    {
      id: "group",
      name: "Group round",
      stage: "group",
      position: 1,
      version: 1,
    },
    {
      id: "semi",
      name: "Semifinal",
      stage: "knockout",
      position: 1,
      version: 1,
    },
    { id: "final", name: "Final", stage: "knockout", position: 2, version: 1 },
  ];
  const pools = [
    "final",
    "group",
    "group",
    "group",
    "group",
    "group",
    "semi",
  ].map((roundId, i) => ({
    id: String(i),
    name: `Pool ${i}`,
    roundId,
    version: 1,
    fmMode: null,
    fmRestrictions: "",
    lockedAt: null,
    selectionLockedAt: null,
    showcaseAt: null,
    publishedAt: null,
    updatedAt: new Date(0),
  }));
  const html = renderToStaticMarkup(
    <TournamentDashboardSummary
      base="/admin/tournaments/test"
      teams={teams}
      pools={{ rounds, pools, entries: [] }}
      fixtures={null}
      streams={null}
      tr={english}
      now={0}
    />,
  );
  expect(
    Array.from(
      html.matchAll(/<strong>([^<]+)<\/strong>/g),
      (match) => match[1],
    ),
  ).toEqual([
    ...teams.map((team) => team.name),
    "Pool 1",
    "Pool 2",
    "Pool 3",
    "Pool 4",
    "Pool 5",
    "Pool 6",
    "Pool 0",
  ]);
  expect(html.match(/<h3>[^<]+<\/h3>/g)).toEqual([
    "<h3>Group Stage</h3>",
    "<h3>Knockout Stage</h3>",
  ]);
  expect(html).toContain('href="/admin/tournaments/test/teams"');
  expect(html).not.toContain("<details");
});
