import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventSchedule } from "../../src/components/event-schedule";
import { sourceMessages } from "../../scripts/i18n";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

it("registers the schedule array labels and first-pick branches for extraction", () => {
  const messages = sourceMessages();
  for (const label of [
    "Mappool",
    "Match number & time",
    "Red team",
    "Score",
    "Blue team",
    "First pick",
    "Red bans",
    "Blue bans",
    "MPLink",
    "Recording",
    "Referee",
    "Streamer",
  ])
    expect(messages.has(label), label).toBe(true);
});

it.each([
  ["en", en, "Red team", "Blue team"],
  ["zh-Hans", hans, "红方", "蓝方"],
  ["zh-Hant", hant, "紅方", "藍方"],
] as const)(
  "translates headers and both first-pick branches in %s",
  (locale, messages, red, blue) => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <EventSchedule
          edition="synthetic"
          matches={["red", "blue"].map((first) => ({
            id: first,
            round: "GF",
            stage: "knockout",
            pool: "Original Pool",
            time: "2026-01-01",
            red: "Red team 原文",
            blue: "Blue team 原文",
            score: [1, 0],
            first,
          }))}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(`<th scope="col">${red}</th>`);
    expect(html).toContain(`<th scope="col">${blue}</th>`);
    expect(html).toContain(`<td>${red}</td>`);
    expect(html).toContain(`<td>${blue}</td>`);
    expect(html).toContain("Red team 原文");
    expect(html).toContain("Blue team 原文");
    expect(html).toContain("Original Pool");
    if (locale !== "en") {
      expect(html).not.toContain('<th scope="col">Red team</th>');
      expect(html).not.toContain('<th scope="col">Blue team</th>');
    }
  },
);
