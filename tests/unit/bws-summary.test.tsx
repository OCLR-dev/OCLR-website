import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { BwsSummary } from "../../src/components/bws-summary";
import { summarizeBws } from "../../src/lib/bws-model";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import messages from "../../messages/en.json";

function render(
  rank: number | null,
  pp: number | null,
  pending = false,
  variant: "detail" | "compact" = "detail",
  globalRankPercent: number | null = null,
) {
  const profile = normalizeOsuProfile(
    {
      id: 1,
      username: "Synthetic",
      badges: pending ? null : [],
      statistics: {
        global_rank: rank,
        pp,
        global_rank_percent: globalRankPercent,
      },
    },
    1,
    "osu",
    "2026-10-24T00:00:00Z",
  );
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <BwsSummary
        variant={variant}
        countryRank={profile.statistics.countryRank}
        globalRankPercent={profile.statistics.globalRankPercent}
        value={summarizeBws({ profile, stale: true, notice: null }, null)}
      />
    </NextIntlClientProvider>,
  );
}
describe("shared public and staff BWS display", () => {
  it("shows pp without rank and retains the stale warning", () => {
    const html = render(null, 1234.567);
    expect(html).toContain("Unranked / unavailable");
    expect(html).toContain("1,234.57");
    expect(html).toContain("BW-PP");
    expect(html).toContain("pp^(1.0063^(badges^2)/1)");
    expect(html).toContain("Stale snapshot");
  });
  it("shows rank without pp and never fabricates a zero", () => {
    const html = render(10000, null);
    expect(html).toContain("10,000");
    expect(html).toContain("Weighted pp unavailable");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("floors the weighted pp and keeps the raw values in the note", () => {
    const html = render(10000, 1234.567, false, "compact");
    expect(html).toContain('<strong class="bws-value">1,234</strong>');
    expect(html).not.toContain("(Rank #");
    expect(html).not.toContain("(Original pp");
    expect(html).toContain("Original pp: 1,234.57");
  });
  it("colours rank values by the global rank tier", () => {
    const html = render(10000, 1234.567, false, "compact", 0.01);
    expect(html).toContain(
      'class="bws-value bws-value--rank-tier bws-value--tier-gold"',
    );
    expect(html).not.toContain("bws-value--tier-radiant");
  });
  it("leaves ranks uncoloured when no percentage is available", () => {
    const html = render(10000, 1234.567, false, "compact");
    expect(html).toContain('<strong class="bws-value">');
    expect(html).not.toContain("bws-value--rank-tier");
  });
  it("shows the plain rank and pp while badges await review", () => {
    expect(render(null, 0)).toContain('class="bws-value">0</strong>');
    const html = render(10000, 1234.567, true, "compact");
    expect(html).toContain("Global rank");
    expect(html).toContain(
      '<span class="bws-value-hash">#</span>10,000</strong>',
    );
    expect(html).toContain("pp");
    expect(html).toContain(
      '<span class="bws-value-hash">#</span>10,000</strong>',
    );
    expect(html).toContain('class="bws-value">1,234</strong>');
    expect(html).not.toContain("BW-rank");
    expect(html).not.toContain("BW-PP");
    expect(html).toContain("Badge eligibility pending staff review");
  });
  it("shows the provider badge count and artwork left of OII", () => {
    const profile = normalizeOsuProfile(
      {
        id: 1,
        username: "Synthetic",
        badges: [
          {
            description: "Synthetic tournament",
            awarded_at: "2026-01-01T00:00:00Z",
            url: "https://osu.ppy.sh/wiki/en/Tournaments",
            image_url: "https://assets.ppy.sh/profile-badges/synthetic.png",
            "image@2x_url":
              "https://assets.ppy.sh/profile-badges/synthetic@2x.png",
          },
          {
            description: "Synthetic contributor",
            awarded_at: "2025-01-01T00:00:00Z",
          },
        ],
        statistics: { global_rank: 10000, pp: 1000 },
      },
      1,
      "osu",
      "2026-10-24T00:00:00Z",
    );
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <BwsSummary
          variant="compact"
          countryRank={321}
          globalRankPercent={0.01}
          oii={1.35}
          badges={profile.badges}
          value={summarizeBws(
            { profile, stale: false, notice: null },
            ["osu", "other"],
          )}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(">Badges<");
    expect(html).toContain('<strong class="bws-value">2</strong>');
    expect(html).toContain("synthetic@2x.png");
    expect(html).toContain("Synthetic tournament");
    expect(html).toContain("Synthetic contributor");
    expect(html.indexOf(">Badges<")).toBeLessThan(html.indexOf(">OII<"));
  });
});
