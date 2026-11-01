import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { english } from "../../src/i18n/translate";
import type { StatisticsWorkspace } from "../../src/lib/archive-statistics";
import { statisticsSource } from "../fixtures/archive-statistics";
vi.mock("../../src/i18n/shared", () => ({ useAppTranslations: () => english }));
import { SourceReview } from "../../src/components/statistics-manager";
import { StaffReadOnlyContext } from "../../src/components/staff-read-only";

it("loads existing review evidence and reasons without clearing accepted games", () => {
  const source = statisticsSource();
  const review: StatisticsWorkspace["reviews"][number] = {
    mpId: source.match.id,
    version: 3,
    poolId: "final",
    allowUnlistedMaps: false,
    excludedScores: [],
    rosterTeamGames: [],
    technicalAdjudication: true,
    adjudication: {
      kind: "technical",
      note: "Synthetic retained decision",
      evidenceUrl: "https://example.com/decision",
    },
    excludedGames: [
      { gameId: 3, reason: "superseded-replay" },
      { gameId: 4, reason: "unknown" },
    ],
    reviewedBy: 123,
    reviewedAt: "2026-11-01T00:00:00Z",
    evidenceUrl: "https://example.com/source",
    complete: true,
    fetchedAt: source.fetchedAt,
    warnings: [],
    games: source.games.map((game) => ({
      game,
      included: game.id < 3,
      nonParticipantIds: [],
      issues: [],
    })),
  };
  const render = (readOnly: boolean) =>
    renderToStaticMarkup(
      <StaffReadOnlyContext.Provider value={readOnly}>
        <SourceReview
          review={review}
          pools={[{ id: "final", name: "Synthetic Final" }]}
          busy={false}
          saving={false}
          canReviewExceptions
          save={async () => {
            throw new Error("Rendering must not write");
          }}
        />
      </StaffReadOnlyContext.Provider>,
    );
  const html = render(false);
  expect(html).toContain('value="https://example.com/source"');
  expect(html).toContain('value="https://example.com/decision"');
  expect(html).toContain("Synthetic retained decision");
  expect(html).toContain('value="superseded-replay" selected=""');
  expect(html).toContain('aria-label="Include game 1" checked=""');
  expect(html).not.toContain('aria-label="Exclusion reason 1"');
  expect(html).toContain('aria-label="Exclusion reason 3"');
  expect(render(true)).toContain(
    '<fieldset class="staff-readonly-fields" disabled=""',
  );
});
