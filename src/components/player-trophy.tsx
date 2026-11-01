import { appearanceLabel } from "@/i18n/appearance";
import { useAppTranslations } from "@/i18n/shared";
import type {
  CompetitionEditionRecord,
  PlayerCompetitionRecord,
} from "@/lib/player-competition-model";
import styles from "./player-trophy.module.css";

type TrophyTier = "champion" | "runnerUp" | "third" | "none";

const palette: Record<
  TrophyTier,
  {
    light: string;
    metal: string;
    dark: string;
    shine: string;
    glow: string;
  }
> = {
  champion: {
    light: "#fff1b8",
    metal: "#f3c33f",
    dark: "#a86b0b",
    shine: "#fff8db",
    glow: "rgb(243 195 63 / 14%)",
  },
  runnerUp: {
    light: "#ffffff",
    metal: "#c8d2dc",
    dark: "#768493",
    shine: "#ffffff",
    glow: "rgb(200 210 220 / 12%)",
  },
  third: {
    light: "#ffe0c2",
    metal: "#c9834a",
    dark: "#7a3f17",
    shine: "#ffead8",
    glow: "rgb(201 131 74 / 14%)",
  },
  none: {
    light: "#d7dee8",
    metal: "#8896a8",
    dark: "#475366",
    shine: "#e8edf3",
    glow: "rgb(148 163 184 / 8%)",
  },
};

/** A season theme label such as "S10 · 晴空未来城", or the season alone. */
export function trophyEditionLabel(
  edition: CompetitionEditionRecord,
  tr: (message: string) => string,
) {
  const theme = edition.defaultAppearance
    ? appearanceLabel(edition.defaultAppearance, tr)
    : null;
  if (theme && /^S\d+\s*·/.test(theme)) return theme;
  const match = /^(?:S|Season\s*)?0*(\d+)$/i.exec(edition.season?.trim() ?? "");
  if (match) return `S${Number(match[1])}`;
  return edition.editionName?.trim() || "—";
}

function trophyEditions(record: PlayerCompetitionRecord, tier: TrophyTier) {
  if (tier === "none") return [];
  return record.editions.filter(
    (edition) =>
      !edition.unavailable &&
      (tier === "champion"
        ? edition.champion
        : tier === "runnerUp"
          ? edition.runnerUp
          : edition.thirdPlace),
  );
}

function tierOf(record: PlayerCompetitionRecord): TrophyTier {
  if (record.championships > 0) return "champion";
  if (record.runnerUps > 0) return "runnerUp";
  if (record.thirdPlaces > 0) return "third";
  return "none";
}

/** The best known tournament rank, including non-podium placement bands. */
export function bestTournamentFinish(record: PlayerCompetitionRecord) {
  let best = record.bestPlacing;
  for (const edition of record.editions) {
    if (edition.unavailable) continue;
    const label = edition.finish?.label;
    const ranked =
      edition.placingRange?.start ?? (label ? /^(\d+)/.exec(label) : null);
    const rank =
      typeof ranked === "number" ? ranked : ranked ? Number(ranked[1]) : null;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

function TrophyArt({ tier }: { tier: TrophyTier }) {
  if (tier === "none") {
    return (
      <svg
        className={styles.art}
        viewBox="0 0 200 200"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="9 8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M62 56 C43 54 35 66 38 80 C41 94 52 101 64 99" />
          <path d="M138 56 C157 54 165 66 162 80 C159 94 148 101 136 99" />
          <path d="M62 42 H138 V66 C138 91 122 108 100 108 C78 108 62 91 62 66 Z" />
          <path d="M93 108 H107 L110 130 H90 Z" />
          <path d="M86 130 H114" />
          <path d="M72 138 H128 L138 164 H62 Z" />
          <rect x="58" y="164" width="84" height="10" rx="4" />
        </g>
      </svg>
    );
  }

  const colors = palette[tier];
  const id = `player-trophy-${tier}`;
  return (
    <svg
      className={styles.art}
      viewBox="0 0 200 200"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.light} />
          <stop offset="0.45" stopColor={colors.metal} />
          <stop offset="1" stopColor={colors.dark} />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.shine} />
          <stop offset="0.55" stopColor={colors.light} />
          <stop offset="1" stopColor={colors.metal} />
        </linearGradient>
        <linearGradient id={`${id}-plate`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.metal} />
          <stop offset="0.6" stopColor={colors.dark} />
          <stop offset="1" stopColor={colors.dark} />
        </linearGradient>
      </defs>
      <circle cx="100" cy="96" r="78" fill={colors.glow} />
      <ellipse
        cx="100"
        cy="177"
        rx="44"
        ry="6"
        fill={colors.dark}
        opacity="0.18"
      />
      <g
        fill="none"
        stroke={`url(#${id}-metal)`}
        strokeWidth="9"
        strokeLinecap="round"
      >
        <path d="M62 56 C43 54 35 66 38 80 C41 94 52 101 64 99" />
        <path d="M138 56 C157 54 165 66 162 80 C159 94 148 101 136 99" />
      </g>
      <path
        d="M62 42 H138 V66 C138 91 122 108 100 108 C78 108 62 91 62 66 Z"
        fill={`url(#${id}-metal)`}
      />
      <rect
        x="58"
        y="37"
        width="84"
        height="9"
        rx="4.5"
        fill={`url(#${id}-rim)`}
      />
      <path
        d="M74 48 C73 66 81 89 95 99"
        fill="none"
        stroke={colors.shine}
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.42"
      />
      <path
        d="M100 57 L103.8 66.2 L113.6 67 L106.1 73.3 L108.4 82.8 L100 77.5 L91.6 82.8 L93.9 73.3 L86.4 67 L96.2 66.2 Z"
        fill={colors.shine}
        opacity="0.92"
      />
      <path d="M93 108 H107 L110 130 H90 Z" fill={`url(#${id}-metal)`} />
      <rect
        x="86"
        y="128"
        width="28"
        height="10"
        rx="3"
        fill={`url(#${id}-rim)`}
      />
      <path d="M72 138 H128 L138 164 H62 Z" fill={`url(#${id}-metal)`} />
      <path
        d="M72 138 H128 L131 147 H69 Z"
        fill={colors.shine}
        opacity="0.26"
      />
      <rect
        x="58"
        y="163"
        width="84"
        height="11"
        rx="4"
        fill={`url(#${id}-plate)`}
      />
    </svg>
  );
}

function PlacementTrophy({
  tier,
}: {
  tier: "champion" | "runnerUp" | "third";
}) {
  return (
    <svg
      className={styles.medalIcon}
      data-tier={tier}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 3.5h10v4.2c0 2.8-2.2 5.3-5 5.3s-5-2.5-5-5.3V3.5Z"
        fill="currentColor"
      />
      <path
        d="M7 5H4.6v2.2c0 1.7 1.2 3 2.9 3.1M17 5h2.4v2.2c0 1.7-1.2 3-2.9 3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M10.6 13h2.8l.7 3h-4.2l.7-3Z" fill="currentColor" />
      <path d="M8.5 16h7l1 3.2h-9L8.5 16Z" fill="currentColor" />
      <rect
        x="7.2"
        y="19.8"
        width="9.6"
        height="1.4"
        rx="0.7"
        fill="currentColor"
      />
      <path
        d="M9.5 5.2H14"
        fill="none"
        stroke="rgb(255 255 255 / 45%)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlayerTrophy({ record }: { record: PlayerCompetitionRecord }) {
  const tr = useAppTranslations();
  const tier = tierOf(record);
  const editions = trophyEditions(record, tier);
  const [latest, ...older] = editions.map((edition) => ({
    slug: edition.editionSlug,
    label: trophyEditionLabel(edition, tr),
  }));
  const label =
    tier === "champion"
      ? tr("Champion trophy")
      : tier === "runnerUp"
        ? tr("Runner-up trophy")
        : tier === "third"
          ? tr("Third-place trophy")
          : tr("Participation trophy");
  return (
    <div className={`panel ${styles.card}`} data-tier={tier}>
      <div className={styles.trophyColumn}>
        <div className={styles.trophy} role="img" aria-label={label}>
          {tier !== "none" && (
            <span className={styles.aura} aria-hidden="true" />
          )}
          <TrophyArt tier={tier} />
        </div>
        {latest && (
          <div className={styles.captionRow}>
            <span className={styles.caption}>{latest.label}</span>
            {older.length > 0 && (
              <span className={styles.more}>
                <button
                  type="button"
                  className={styles.moreButton}
                  aria-label={tr("Other tournaments")}
                >
                  <span aria-hidden="true">…</span>
                </button>
                <span
                  className={styles.morePanel}
                  role="tooltip"
                  aria-label={tr("Other tournaments")}
                >
                  {older.map((edition) => (
                    <span key={edition.slug} className={styles.moreEntry}>
                      {edition.label}
                    </span>
                  ))}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      <dl className={styles.stats}>
        <div>
          <dt>{tr("Championships")}</dt>
          <dd className={styles.medalValue}>
            <PlacementTrophy tier="champion" />
            <span>{record.championships}</span>
          </dd>
        </div>
        <div>
          <dt>{tr("Runner-up finishes")}</dt>
          <dd className={styles.medalValue}>
            <PlacementTrophy tier="runnerUp" />
            <span>{record.runnerUps}</span>
          </dd>
        </div>
        <div>
          <dt>{tr("Third-place finishes")}</dt>
          <dd className={styles.medalValue}>
            <PlacementTrophy tier="third" />
            <span>{record.thirdPlaces}</span>
          </dd>
        </div>
        <div>
          <dt>{tr("Best finish")}</dt>
          <dd>{bestTournamentFinish(record) ?? "—"}</dd>
        </div>
        <div>
          <dt>{tr("Tournament appearances")}</dt>
          <dd>{record.seasons}</dd>
        </div>
      </dl>
    </div>
  );
}
