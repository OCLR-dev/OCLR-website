import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  CompactPlayerRatings,
  CoverPlayerRatings,
} from "../../src/components/player-profile-ratings";
import { PlayerRatingRadar } from "../../src/components/player-rating-radar";
import {
  profileRatingsSchema,
  profileSipTotal,
} from "../../src/lib/profile-ratings-model";
import { sipRating, sipResponse } from "../fixtures/sip-response";

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
      source: "api",
      value: 6.13512525816855,
      mods: { NM: 0, HD: 6.1 },
      provisional: true,
      outdated: true,
      importedAt: time,
    },
  });
  const html = renderToStaticMarkup(<CoverPlayerRatings ratings={ratings} />);
  for (const text of [
    "-4",
    "SkillIssue API · OCLR fetch time",
    "S11 CSV · OCLR import time",
    "Elitebotix API · OCLR fetch time",
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

it("plots ETX mods, SIP mods and SIP skills separately with zero values and gaps", () => {
  const ratings = profileRatingsSchema.parse({
    otr: null,
    sip: {
      api: {
        value: null,
        fetchedAt: "2025-06-04T12:34:00Z",
        snapshot: {
          rating: null,
          modifications: {
            NoMod: sipRating("NoMod", 2450),
            "Hard Rock": { ...sipRating("Hard Rock", 500), sr: 0 },
            "Double Time": { ...sipRating("Double Time", -12), sr: 12.25 },
          },
          skillsets: {
            "High AR": { ...sipRating("High AR", 0), sr: 8.75 },
            "Low AR": { ...sipRating("Low AR", 10), sr: -1 },
          },
        },
      },
      csv: null,
    },
    etx: {
      source: "csv",
      value: 6.14,
      mods: { NM: 0, HR: 6.15, FM: 5 },
      provisional: false,
      outdated: false,
      importedAt: null,
    },
  });
  const html = renderToStaticMarkup(<PlayerRatingRadar ratings={ratings} />);
  const card = (id: string) =>
    html.match(
      new RegExp(`aria-labelledby="player-rating-${id}">(.*?)</article>`),
    )?.[1];
  const etx = card("etx-mods");
  const sipMods = card("sip-mods");
  const sipSkills = card("sip-skills");
  expect(etx).toContain("ETX · Mod ratings");
  expect(etx).toContain(">10</text>");
  expect(etx).toContain(">FM</text>");
  expect(etx).toContain(">5.00");
  expect(etx).toContain('cx="160" cy="120"');
  expect(etx?.match(/ L /g)).toHaveLength(1);
  expect(sipMods).toContain("SIP · Mod ratings");
  expect(sipMods).toContain(">15</text>");
  expect(sipMods).toContain(">0.00");
  expect(sipMods).toContain(">12.25");
  expect(sipMods).not.toMatch(/2450|>FM<|8\.75/);
  expect(sipSkills).toContain("SIP · Skillset ratings");
  expect(sipSkills).toContain(">High AR</text>");
  expect(sipSkills).toContain(">8.75");
  expect(sipSkills?.match(/r="4\.5"/g)).toHaveLength(1);
  expect(sipSkills).not.toContain("<path");
  expect(sipSkills).not.toContain(">12.25");

  const sipOnly = renderToStaticMarkup(
    <PlayerRatingRadar ratings={{ ...ratings, etx: null }} />,
  );
  expect(sipOnly).not.toContain("ETX · Mod ratings");
  expect(sipOnly.match(/<article/g)).toHaveLength(2);
});

it("omits charts for saved overall ratings without category values", () => {
  const ratings = profileRatingsSchema.parse({
    otr: null,
    sip: { api: null, csv: { value: 2000, importedAt: null } },
    etx: {
      value: 5,
      mods: null,
      provisional: false,
      outdated: false,
      importedAt: null,
    },
  });
  expect(renderToStaticMarkup(<PlayerRatingRadar ratings={ratings} />)).toBe(
    "",
  );
});
