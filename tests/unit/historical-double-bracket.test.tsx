import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import s10 from "../../docs/imports/s10-archive.json";
import { BracketColumns } from "../../src/components/bracket-columns";
import { archiveBracket } from "../../src/lib/archive-bracket";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";

vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () => (message: string) => message,
}));

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

it("places reviewed matches in separate winners, losers and grand final sections", () => {
  const archive = historicalArchiveSchema.parse(s10);
  const bracket = archiveBracket(archive, (id) => `/matches/${id}`)!;
  const knockout = bracket.groups[0];
  // Lane membership must follow the saved outcomes even when round labels
  // happen to use the name of a different bracket.
  knockout.rounds[0].label = "Losers bracket";
  const html = renderToStaticMarkup(
    <BracketColumns
      bracket={{ ...bracket, groups: [knockout] }}
      hideGroupTabs
    />,
  );
  const [upper, lower, final] = html
    .split(/<section class="bracket-lane /)
    .slice(1);
  const matches = (lane: string) =>
    [...lane.matchAll(/data-match-id="match-(\d+)"/g)].map((match) => match[1]);

  expect(upper).toContain(">Winners bracket</h2>");
  expect(matches(upper)).toEqual(["21", "22", "27"]);
  expect(lower).toContain(">Losers bracket</h2>");
  expect(matches(lower)).toEqual(["23", "24", "26", "25", "28", "29"]);
  expect(final).toContain(">Grand final</h2>");
  expect(matches(final)).toEqual(["30"]);
  expect(final).toContain('href="/matches/match-30"');

  const fallback = renderToStaticMarkup(
    <BracketColumns
      bracket={{
        ...bracket,
        groups: [{ ...knockout, showAdvancement: false }],
      }}
      hideGroupTabs
    />,
  );
  expect(fallback).not.toContain("bracket-double");
  expect(matches(fallback)).toHaveLength(10);
});
