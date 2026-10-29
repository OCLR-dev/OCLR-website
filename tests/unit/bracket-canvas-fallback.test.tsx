import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ResolvedBracket } from "../../src/lib/bracket-model";

vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () => (s: string) => s,
}));
vi.mock("../../src/lib/double-bracket-adapter", () => ({
  doubleBracketMatches: () => null,
}));
vi.mock("../../src/components/bracket-columns", () => ({
  BracketColumns: ({ bracket }: { bracket: ResolvedBracket }) => (
    <pre>{JSON.stringify(bracket.groups)}</pre>
  ),
}));
import { BracketCanvas } from "../../src/components/bracket-canvas";

it("keeps partial historical rounds and always retains recorded appearance links", () => {
  const group: ResolvedBracket["groups"][number] = {
    id: "path",
    label: "Match path",
    rounds: [
      {
        id: "final",
        label: "Undated final",
        matches: [
          {
            id: "final",
            label: "Final",
            status: "completed",
            scores: [6, 4],
            winnerSlot: 0,
            note: null,
            slots: [
              {
                kind: "team",
                teamId: "a",
                label: "A",
                sourceMatchId: "earlier",
              },
              { kind: "team", teamId: "b", label: "B", sourceMatchId: null },
            ],
          },
        ],
      },
    ],
  };
  const html = renderToStaticMarkup(
    <BracketCanvas group={group} editionSlug="s2" />,
  );
  expect(html).not.toContain("&quot;layout&quot;:&quot;grid&quot;");
  expect(html).toContain("Undated final");
  expect(html).toContain("Recorded appearance only (unconfirmed progression)");
  expect(html).toContain("&quot;sourceMatchId&quot;:&quot;earlier&quot;");
  expect(html).toContain("&quot;sourceMatchId&quot;:null");
  expect(group.rounds[0].matches[0].slots[0].sourceMatchId).toBe("earlier");
});
