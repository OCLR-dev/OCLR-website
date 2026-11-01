import { ProfileInfo } from "./profile-info";
import { useAppTranslations } from "@/i18n/shared";
import {
  calculateBadgeWeightedPp,
  calculateBws,
  type BwsSummary as Summary,
} from "@/lib/bws-model";
import type { ProfileBadge } from "@/lib/osu-profile-model";
import { isGameplayBadge } from "@/lib/badge-activity";
import { globalRankTier, type GlobalRankTier } from "@/lib/rank-tier";

const BWS_PP_FORMULA = "pp^(1.0063^(badges^2)/1)";

function BwsNote({
  value,
  includePpFormula = true,
}: {
  value: Summary;
  includePpFormula?: boolean;
}) {
  const tr = useAppTranslations();
  return (
    <>
      <p className="small muted">
        <code>{"globalRank ^ (0.9937 ^ (badges ^ 2))"}</code>
      </p>
      {includePpFormula && (
        <p className="small muted">
          <code>{BWS_PP_FORMULA}</code>
        </p>
      )}
      <p className="small muted">
        {value.badgeCount === null
          ? tr("Badge eligibility pending staff review")
          : tr("Eligible tournament badges: {count}", {
              count: value.badgeCount,
            })}
      </p>
      <p className="small muted">
        {tr(
          "Informational for the selected ruleset, not a leaderboard position or registration decision.",
        )}{" "}
        <a
          className="text-link"
          href="https://osu.ppy.sh/wiki/en/Tournaments/Badge-weighted_seeding"
        >
          {tr("BWS formula")}
        </a>
      </p>
      {value.reviewedAt ? (
        <p className="small muted">
          {tr("Staff-reviewed badge classification")} ·{" "}
          <time dateTime={value.reviewedAt}>{value.reviewedAt}</time>
        </p>
      ) : value.badgeCount === 0 ? (
        <p className="small muted">
          {tr("Provider returned no profile badges")}
        </p>
      ) : null}
      <p className="small muted">
        {tr("Profile updated")}{" "}
        <time dateTime={value.fetchedAt}>{value.fetchedAt}</time>
        {value.stale && <> · {tr("Stale snapshot")}</>}
      </p>
    </>
  );
}

function BadgeNote({ badges }: { badges: ProfileBadge[] | null }) {
  const tr = useAppTranslations();
  if (badges === null)
    return (
      <p className="small muted">
        {tr("Badge data is unavailable in this saved profile.")}
      </p>
    );
  if (!badges.length)
    return (
      <p className="small muted">{tr("Provider returned no profile badges")}</p>
    );
  // The ribbons themselves live in the profile body, so the note only explains
  // what the published count means for BWS.
  return (
    <p className="small muted">
      {tr(
        "Total badges published on the osu! profile. BWS counts only staff-reviewed tournament badges.",
      )}
    </p>
  );
}

function RankValue({
  value,
  tier,
}: {
  value: string;
  tier: GlobalRankTier | null;
}) {
  return (
    <strong
      className={
        tier
          ? `bws-value bws-value--rank-tier bws-value--tier-${tier}`
          : "bws-value"
      }
    >
      <span className="bws-value-hash">#</span>
      {value}
    </strong>
  );
}

function InfoTrigger({ onOpenLabel }: { onOpenLabel: string }) {
  return (
    <button
      type="button"
      className="bws-card-note-trigger"
      aria-label={onOpenLabel}
    >
      <svg
        className="bws-card-note-icon"
        viewBox="0 0 16 16"
        width="18"
        height="18"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="8"
          cy="8"
          r="6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        <path
          d="M8 7.1v4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/**
 * Compact badge-weighted seeding card overlaid on the player cover: BWS, the
 * plain country rank and weighted pp side by side, the original rank/pp in small
 * parentheses, and all explanatory copy behind the `i` trigger (same disclosure
 * pattern as map notes).
 */
function CompactBwsSummary({
  value,
  countryRank,
  globalRankPercent,
  oii,
  badges,
}: {
  value: Summary;
  countryRank: number | null;
  globalRankPercent: number | null;
  oii: number | null;
  badges: ProfileBadge[] | null;
}) {
  // The index carries the rank-tier gradient only where it says something:
  // above 1.1 the player is progressing faster than the curve, below 0.9 slower.
  const oiiTier =
    oii !== null && oii > 1.1
      ? " bws-value--oii-up"
      : oii !== null && oii < 0.9
        ? " bws-value--oii-down"
        : "";
  const tier = globalRankTier(globalRankPercent);
  // The leading number counts gameplay results; the total follows after a slash.
  const gameplayBadgeCount =
    badges === null
      ? null
      : badges.filter((badge) => isGameplayBadge(badge.description)).length;
  const tr = useAppTranslations();
  const number = (v: number, digits: number) =>
    new Intl.NumberFormat(tr.locale, {
      maximumFractionDigits: digits,
      notation: v >= 1e12 ? "scientific" : "standard",
    }).format(v);
  // Until staff review badges the weighting is unknown, so the card shows the
  // plain rank and pp instead of a badge-review placeholder. If the profile
  // still carries tournament ribbons, use that automatic count for the
  // weighted values rather than ignoring them.
  const usesAutomaticBadges =
    value.badgeCount === null &&
    gameplayBadgeCount !== null &&
    gameplayBadgeCount > 0;
  const weightedPp = usesAutomaticBadges
    ? calculateBadgeWeightedPp(value.rawPp, gameplayBadgeCount)
    : value.adjustedPp;
  const weightedRank = usesAutomaticBadges
    ? calculateBws(value.globalRank, gameplayBadgeCount)
    : value.value;
  const pending = value.status === "pending" && !usesAutomaticBadges;
  // Zero effective badges make the weighting an identity, so show the plain
  // labels even when staff already confirmed a zero count.
  const unweighted =
    gameplayBadgeCount === 0 &&
    (value.badgeCount === null || value.badgeCount === 0);
  const plainLabels = pending || unweighted;
  return (
    <section
      className="bws-card"
      aria-label={tr("Badge-weighted seeding")}
      role="group"
    >
      <div className="bws-card-metric">
        <div className="bws-card-label-row">
          <span className="bws-card-label">
            {plainLabels ? "pp" : tr("BW-PP")}
          </span>
          <div className="bws-card-note">
            <InfoTrigger onOpenLabel={tr("Explanation")} />
            <div className="bws-card-note-panel" role="note">
              {value.rawPp !== null && (
                <p className="small muted">
                  {tr("Original pp")}: {number(value.rawPp, 2)}
                </p>
              )}
              <p className="small muted">
                <code>{BWS_PP_FORMULA}</code>
              </p>
            </div>
          </div>
        </div>
        <div className="bws-card-value-row">
          {weightedPp !== null ? (
            <strong className="bws-value">
              {number(Math.floor(weightedPp), 0)}
            </strong>
          ) : pending && value.rawPp !== null ? (
            <strong className="bws-value">
              {number(Math.floor(value.rawPp), 0)}
            </strong>
          ) : (
            <span className="bws-card-state">
              {value.ppStatus === "pending" && !usesAutomaticBadges
                ? tr("Badge eligibility pending staff review")
                : tr("Weighted pp unavailable (missing data or numeric limit)")}
            </span>
          )}
        </div>
      </div>
      <span className="bws-card-divider" aria-hidden="true" />
      <div className="bws-card-metric">
        <div className="bws-card-label-row">
          <span className="bws-card-label">
            {plainLabels ? tr("Global rank") : tr("BW-rank")}
          </span>
          <div className="bws-card-note">
            <InfoTrigger onOpenLabel={tr("Explanation")} />
            <div className="bws-card-note-panel" role="note">
              <BwsNote value={value} includePpFormula={false} />
            </div>
          </div>
        </div>
        <div className="bws-card-value-row">
          {weightedRank !== null ? (
            <RankValue value={number(weightedRank, 0)} tier={tier} />
          ) : pending && value.globalRank !== null ? (
            <RankValue value={number(value.globalRank, 0)} tier={tier} />
          ) : (
            <span className="bws-card-state">
              {value.status === "unranked"
                ? tr("Unranked / unavailable")
                : tr("Badge eligibility pending staff review")}
            </span>
          )}
        </div>
      </div>
      <span className="bws-card-divider" aria-hidden="true" />
      <div className="bws-card-metric">
        <span className="bws-card-label">{tr("Country rank")}</span>
        <div className="bws-card-value-row">
          {countryRank !== null ? (
            <RankValue value={number(countryRank, 0)} tier={tier} />
          ) : (
            <span className="bws-card-state">
              {tr("Unranked / unavailable")}
            </span>
          )}
        </div>
      </div>
      <span className="bws-card-divider" aria-hidden="true" />
      <div className="bws-card-metric">
        <div className="bws-card-label-row">
          <span className="bws-card-label">
            {gameplayBadgeCount ? tr("Weighted badge") : tr("Badges")}
          </span>
          <div className="bws-card-note">
            <InfoTrigger onOpenLabel={tr("Explanation")} />
            <div className="bws-card-note-panel" role="note">
              <BadgeNote badges={badges} />
            </div>
          </div>
        </div>
        <div className="bws-card-value-row">
          {badges !== null && gameplayBadgeCount !== null ? (
            <strong
              className={`bws-value${gameplayBadgeCount === 0 ? " bws-value--empty" : ""}`}
            >
              {number(gameplayBadgeCount, 0)}
              <span className="bws-value-total">
                /{number(badges.length, 0)}
              </span>
            </strong>
          ) : (
            <span className="bws-card-state" role="status">
              —
            </span>
          )}
        </div>
      </div>
      <span className="bws-card-divider" aria-hidden="true" />
      <div className="bws-card-metric">
        <div className="bws-card-label-row">
          <span className="bws-card-label">{tr("OII")}</span>
          <div className="bws-card-note">
            <InfoTrigger onOpenLabel={tr("Explanation")} />
            <div className="bws-card-note-panel" role="note">
              <p className="small muted">
                <code>{"expected play hours / play hours"}</code>
              </p>
              <p className="small muted">
                {tr(
                  "OII compares the play time this pp usually needs with the account's actual play time. Above 1.1 means faster than typical, below 0.9 slower.",
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="bws-card-value-row">
          {oii !== null ? (
            <strong
              className={`bws-value${oiiTier ? ` bws-value--rank-tier${oiiTier}` : ""}`}
            >
              {number(oii, 2)}
            </strong>
          ) : (
            <span className="bws-card-state" role="status">
              —
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export function BwsSummary({
  value,
  variant = "detail",
  countryRank = null,
  globalRankPercent = null,
  oii = null,
  badges = null,
}: {
  value: Summary;
  variant?: "detail" | "compact";
  countryRank?: number | null;
  globalRankPercent?: number | null;
  oii?: number | null;
  badges?: ProfileBadge[] | null;
}) {
  const tr = useAppTranslations();
  if (variant === "compact")
    return (
      <CompactBwsSummary
        value={value}
        countryRank={countryRank}
        globalRankPercent={globalRankPercent}
        oii={oii}
        badges={badges}
      />
    );
  return (
    <section className="bws-summary" aria-label={tr("Badge-weighted seeding")}>
      <div className="bws-metrics">
        <div>
          <h3>{tr("BW-rank")}</h3>
          {value.value !== null ? (
            <p>
              <strong className="bws-value">
                {new Intl.NumberFormat(tr.locale, {
                  maximumFractionDigits: 0,
                }).format(value.value)}
              </strong>
            </p>
          ) : (
            <p className="muted" role="status">
              {value.status === "unranked"
                ? tr("Unranked / unavailable")
                : tr("Badge eligibility pending staff review")}
            </p>
          )}
        </div>
        <div>
          <p>
            <span className="muted small">{tr("Original pp")}</span>{" "}
            <strong>
              {value.rawPp === null
                ? tr("Unavailable")
                : new Intl.NumberFormat(tr.locale, {
                    maximumFractionDigits: 2,
                    notation: value.rawPp >= 1e12 ? "scientific" : "standard",
                  }).format(value.rawPp)}
            </strong>
          </p>
        </div>
        <div>
          <h3>{tr("BW-PP")}</h3>
          {value.adjustedPp !== null ? (
            <p>
              <strong className="bws-value">
                {new Intl.NumberFormat(tr.locale, {
                  maximumFractionDigits: 2,
                  notation:
                    value.adjustedPp >= 1e12 ? "scientific" : "standard",
                }).format(value.adjustedPp)}
              </strong>
            </p>
          ) : (
            <p className="muted" role="status">
              {value.ppStatus === "pending"
                ? tr("Badge eligibility pending staff review")
                : tr("Weighted pp unavailable (missing data or numeric limit)")}
            </p>
          )}
        </div>
      </div>
      <ProfileInfo label={tr("Badge-weighted seeding")}>
        <BwsNote value={value} />
      </ProfileInfo>
    </section>
  );
}
