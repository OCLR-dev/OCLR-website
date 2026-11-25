import { createTranslator } from "next-intl";
import en from "../../messages/en.json" with { type: "json" };
import hans from "../../messages/zh-Hans.json" with { type: "json" };
import hant from "../../messages/zh-Hant.json" with { type: "json" };
import type { Locale } from "../i18n/config";
import { appTranslator } from "../i18n/translate";
import type { PublicFixture } from "./public-competition";

const catalogs = { en: en.ui, "zh-Hans": hans.ui, "zh-Hant": hant.ui };

const plain = (text: string, max: number) =>
  Array.from(text.replace(/[\s\p{Cc}]+/gu, " ").trim())
    .slice(0, max)
    .join("")
    .replace(/[\\`*_~|[\]<>()]/g, "\\$&");

export function discordResultMessage({
  origin,
  locale,
  slug,
  fixtureId,
  editionName,
  fixture,
  correcting,
}: {
  origin: string;
  locale: Locale;
  slug: string;
  fixtureId: string;
  editionName?: string;
  fixture?: PublicFixture;
  correcting: boolean;
}) {
  const native = createTranslator({ locale, messages: catalogs[locale] });
  const tr = appTranslator(
    (key, values) => native(key as keyof typeof en.ui, values),
    locale,
  );
  const url = new URL(
    `/tournaments/${encodeURIComponent(slug)}/matches/${encodeURIComponent(fixtureId)}`,
    origin,
  ).href;
  const allowed_mentions = { parse: [] as string[] };
  const result = fixture?.result;
  if (!result || !fixture?.home.team || !fixture.away.team)
    return {
      allowed_mentions,
      embeds: [{ title: tr("Match result withdrawn"), url }],
    };

  const red = plain(fixture.home.team.name, 70);
  const blue = plain(fixture.away.team.name, 70);
  const title = correcting
    ? tr("Corrected match result")
    : tr("Published match result");
  const outcome = result.draw
    ? tr("Draw")
    : result.winnerTeamId === fixture.home.team.id
      ? `${tr("Winner")} · ${red}`
      : result.winnerTeamId === fixture.away.team.id
        ? `${tr("Winner")} · ${blue}`
        : null;
  return {
    allowed_mentions,
    embeds: [
      {
        title,
        url,
        description: [
          [
            editionName && plain(editionName, 80),
            plain(fixture.roundName, 60),
            plain(fixture.label, 45),
          ]
            .filter(Boolean)
            .join(" · "),
          `**${red} ${result.homeWins}–${result.awayWins} ${blue}**`,
          outcome,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  };
}
