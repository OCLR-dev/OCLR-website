import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchDetailsView } from "../../src/components/match-details";
import { PlayerRatings } from "../../src/components/player-ratings";
import { archiveMatchDetails } from "../../src/lib/match-details-model";
import { ratingSnapshot } from "../../src/lib/ratings";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import en from "../../messages/en.json";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

function details() {
  const data = archiveMatchDetails(
    statisticsArchive,
    statisticsArchive.matches[0].id,
    [
      {
        revision: "public-source-fingerprint",
        snapshot: {
          archiveKey: "synthetic",
          source: statisticsSource(),
          poolId: "final",
          included: [1, 2],
        },
      },
    ],
  );
  data.rating = ratingSnapshot(
    [
      {
        gameId: 1,
        fixtureId: "synthetic",
        at: "2020-01-01T00:01:00Z",
        revision: 7,
        fingerprint: "public-source-fingerprint",
        teamIds: data.teamIds,
        winnerTeamId: data.teamIds[0],
        scores: data.games[0].scores.map((s) => ({
          userId: s.osuId,
          teamId: s.teamId!,
          total: s.total!,
        })),
      },
    ],
    new Map(data.games[0].scores.map((s) => [s.osuId, s.username])),
  );
  return data;
}
function render(children: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {children}
    </NextIntlClientProvider>,
  );
}
function match(data: ReturnType<typeof details> | null, historical = false) {
  return render(
    <MatchDetailsView
      details={data}
      slug="s7"
      teams={statisticsArchive.teams}
      timeZone="UTC"
      historical={historical}
    />,
  );
}

describe("match-page presentation", () => {
  for (const historical of [false, true])
    it(`keeps scores and rating without generic policy or source metadata (${historical ? "historical" : "ordinary"})`, () => {
      const data = details();
      const html = match(data, historical);
      expect(html).toContain("Actual MP totals");
      expect(html).toContain("Reviewed score");
      expect(html).toContain("Accuracy");
      expect(html).toContain("300 / 100 / 50");
      expect(html).toContain("MRA");
      expect(html).toContain(data.rating!.players[0].mra.toFixed(4));
      expect(html).toContain(
        historical ? "/tournaments/s7/players/" : "/players/",
      );
      for (const text of [
        "Failed-score policy",
        "MRA combines",
        "Calculation sources",
        "public-source-fingerprint",
        data.rating!.policy,
        "Published source version",
        "Scope: this fixture only",
        "Technical adjudication; recorded series score",
        "Team mapping adjusted",
        "Player data incomplete",
        "Failed scores counted as 0",
      ])
        expect(html).not.toContain(text);
      expect(html.match(/<h2>/g)).toHaveLength(2);
    });

  it("shows only applicable exceptions and preserves actual/zero/missing/excluded values", () => {
    const data = details();
    data.technicalAdjudication = true;
    data.sources[0].complete = false;
    data.failedScorePolicy = "zero";
    const game = data.games[0];
    game.rosterMapping = true;
    game.withheldScores = 1;
    game.scores[0] = {
      ...game.scores[0],
      total: 123,
      effectiveTotal: 0,
      passed: false,
      combo: null,
      hits: null,
    };
    game.scores[1] = { ...game.scores[1], total: 0, effectiveTotal: 0 };
    const html = match(data);
    for (const text of [
      "Technical adjudication; recorded series score",
      "Partial source",
      "Team mapping adjusted",
      "Player data incomplete",
      "Failed scores counted as 0",
      "Excluded from official result",
      "Not applicable",
    ])
      expect(html).toContain(text);
    expect(html).toContain("<td>123</td><td>0</td>");
    expect(html).toContain("<td>0</td><td>0</td>");
    expect(html).toContain(
      "<td>Not recorded</td><td>Not recorded / Not recorded / Not recorded / Not recorded</td>",
    );
    game.scores[0].included = false;
    expect(match(data)).not.toContain("Failed scores counted as 0");
  });

  it("keeps unavailable states and the full rating view used by other pages", () => {
    expect(match(null)).toContain("Match details unavailable.");
    const data = details();
    const full = render(<PlayerRatings report={data.rating!} slug="s7" />);
    for (const text of [
      "MRA combines",
      "Calculation sources",
      "Revision 7",
      data.rating!.policy,
      "YumuRating",
    ])
      expect(full).toContain(text);
    data.rating = null;
    expect(match(data)).toContain(
      "Rating unavailable; approved score data needs review.",
    );
  });
});
