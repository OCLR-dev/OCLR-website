import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PlayerProfile } from "../../src/components/player-profile";
import en from "../../messages/en.json";
import type { ProfileSnapshot } from "../../src/lib/osu-profile-model";
import styles from "../../src/app/players/[osuId]/profile.module.css";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import type { CSSProperties } from "react";

// A real PlayerProfile whose osu! response carries no banner artwork. It has
// to render the same cover card layout as player-profile-cover.tsx, not the
// older stacked card, so the heading, the id pill and the summary card keep
// their cover positions and only the artwork and its scrim are absent.
const themeTokens: CSSProperties = {
  "--space-panel": "1.5rem",
  "--radius-panel": "1.375rem",
} as CSSProperties;
const snapshot: ProfileSnapshot = {
  stale: false,
  notice: null,
  profile: {
    osuId: 7003013,
    username: "Player",
    canonicalUrl: "https://osu.ppy.sh/users/7003013/osu",
    avatarUrl: null,
    coverUrl: null,
    countryCode: "CN",
    countryName: "China",
    defaultRuleset: "osu",
    joinedAt: "2019-04-02",
    lastSeenAt: "2026-10-30",
    previousUsernames: ["OldName"],
    active: true,
    bot: false,
    ruleset: "osu",
    fetchedAt: "2026-08-14T00:00:00.000Z",
    source: "osu! API v2",
    rankHistory: {
      mode: "osu",
      data: [24000, 21000, 19000, 18000, 15000, 12345],
    },
    badges: [
      {
        description: "Contributed",
        awardedAt: "2024-01-02T00:00:00Z",
        url: null,
      },
    ],
    statistics: {
      globalRank: 12345,
      globalRankPercent: 0.0142,
      countryRank: 321,
      pp: 1000,
      accuracy: 98.12,
      playCount: 12345,
      totalHits: 1234567,
      playTimeSeconds: 1054805,
      rankedScore: "123456789",
      totalScore: "234567891",
      maximumCombo: 1234,
      level: { current: 75, progress: 42 },
      grades: { ssh: 3, ss: 9 },
    },
  },
};
const bws = {
  mode: "osu" as const,
  status: "ready" as const,
  value: 12345,
  rawPp: 1000,
  adjustedPp: 1000,
  ppStatus: "ready" as const,
  stale: false,
  badgeCount: 0,
  globalRank: 12345,
  reviewedAt: null,
  fetchedAt: "2026-08-14T00:00:00.000Z",
};

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <main style={{ padding: 24 }}>
      <div
        className="themed-site"
        data-appearance="default"
        style={themeTokens}
      >
        <div className="public-tournament public-player-page">
          <PlayerProfile
            snapshot={snapshot}
            bws={bws}
            heading={
              <header className={styles.heading}>
                <div className="avatar" aria-hidden="true" />
                <div className={styles.headingText}>
                  <div className={styles.nameRow}>
                    <h1>Player</h1>
                  </div>
                  <p>China (CN)</p>
                  <span className={styles.previousNames}>
                    Previous usernames: OldName
                  </span>
                </div>
              </header>
            }
          />
        </div>
      </div>
    </main>
  </NextIntlClientProvider>,
);
