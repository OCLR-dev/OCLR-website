import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PlayerIdBadge } from "../../src/components/player-id-badge";
import { ProfileLevel } from "../../src/components/profile-level";
import { BwsSummary } from "../../src/components/bws-summary";
import { RankChart } from "../../src/components/rank-chart";
import { rankTierPalette } from "../../src/lib/rank-tier";
import en from "../../messages/en.json";
import styles from "../../src/app/players/[osuId]/profile.module.css";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import type { CSSProperties } from "react";

// The real layout wraps every page in .themed-site; tokens live there. Tailwind
// turns globals.css `@theme` into these variables, which this CSS-only host
// does not process.
const themeTokens = {
  "--space-panel": "1.5rem",
  "--radius-panel": "0.75rem",
} as CSSProperties;

// A ready osu! snapshot: the card sits beside the heading so the improvement
// index and its colour band are checked in the real composition.
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

// A short rank history so the two-column profile body renders under the cover.
const history = [24000, 21000, 19000, 18000, 15000, 12345];

// The real cover branch of PlayerProfile: the player id pill and level chip
// anchored to the card corners, with the identity heading overlaid on the
// cover and the rank chart / statistics body below it.
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <main style={{ padding: 24 }}>
      {/* The real layout wraps every page in .themed-site; tokens live there. */}
      <div
        className="themed-site"
        data-appearance="default"
        style={themeTokens}
      >
        <section className="panel profile-summary">
          <PlayerIdBadge osuId={7003013} palette={rankTierPalette(0.0142)} />
          <div className="profile-cover">
            <ProfileLevel level={75} progress={42} />
            <div className="profile-cover-content">
              <header className={styles.heading}>
                <div className="avatar" aria-hidden="true" />
                <div className={styles.headingText}>
                  <div className={styles.nameRow}>
                    <h1>
                      <a
                        href="https://osu.ppy.sh/users/7003013"
                        className={styles.identityLink}
                      >
                        Player
                      </a>
                    </h1>
                  </div>
                  <p className="muted">CN (CN)</p>
                </div>
              </header>
              <BwsSummary
                value={bws}
                variant="compact"
                countryRank={321}
                globalRankPercent={0.0142}
                oii={1.35}
              />
            </div>
          </div>
          <div className="profile-body">
            <div className="rank-chart-card">
              <RankChart data={history} globalRank={12345} />
            </div>
            <dl className="profile-statistics">
              {[
                ["Accuracy", "98.12%"],
                ["Play count", "12,345"],
                ["Total hits", "1,234,567"],
                ["Play time", "12d 3h 4m 5s"],
                ["Ranked score", "123,456,789"],
                ["Total score", "234,567,891"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>
    </main>
  </NextIntlClientProvider>,
);
