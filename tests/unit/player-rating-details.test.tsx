import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  CompactPlayerRatings,
  PlayerRatingDetails,
} from "../../src/components/player-profile-ratings";
import {
  profileRatingsSchema,
  profileSipTotal,
} from "../../src/lib/profile-ratings-model";
import { sipResponse } from "../fixtures/sip-response";

vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () =>
    Object.assign((text: string) => text, { locale: "en" }),
}));

it("labels SIP sources separately and shows profile ETX ratings to two decimal places", () => {
  const time = "2025-06-04T12:34:00Z";
  const { modifications, skillsets } = sipResponse(1, 0);
  const ratings = profileRatingsSchema.parse({
    otr: null,
    sip: {
      api: {
        value: null,
        fetchedAt: time,
        snapshot: { rating: null, modifications, skillsets },
      },
      csv: { value: -4, importedAt: null },
    },
    etx: {
      value: 6.13512525816855,
      mods: { NM: 0, HD: 6.1 },
      provisional: true,
      outdated: true,
      importedAt: time,
    },
  });
  const html = renderToStaticMarkup(<PlayerRatingDetails ratings={ratings} />);
  for (const text of [
    "-4",
    "SkillIssue API · OCLR fetch time",
    "S11 CSV · OCLR import time",
    time,
    "Hard Rock: 0",
    "High AR: -12",
    "26%",
    "74%",
    "6.14 ★",
    "Provisional rating",
    "Outdated rating",
    "0.00 ★",
    "6.10 ★",
    "No rating data",
  ])
    expect(html).toContain(text);
  expect(
    renderToStaticMarkup(
      <CompactPlayerRatings ratings={ratings} etxFractionDigits={2} />,
    ),
  ).toContain("6.14 ★");
  expect(
    renderToStaticMarkup(<CompactPlayerRatings ratings={ratings} />),
  ).toContain("6.13512525816855 ★");
  expect(
    profileSipTotal({
      ...ratings,
      sip: {
        ...ratings.sip,
        api: { value: 0, snapshot: null, fetchedAt: time },
      },
    }),
  ).toBe(0);
});
