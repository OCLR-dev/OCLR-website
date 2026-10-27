import { useAppTranslations } from "@/i18n/shared";
import type { BwsSummary as Summary } from "@/lib/bws-model";
export function BwsSummary({ value }: { value: Summary }) {
  const tr = useAppTranslations();
  return (
    <section className="bws-summary" aria-label={tr("Badge-weighted seeding")}>
      <h3>{tr("Rank-based BWS")}</h3>
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
      <p className="small muted">
        <code>{"globalRank ^ (0.9937 ^ (badges ^ 2))"}</code>
      </p>
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
      <h3>{tr("Badge-weighted pp")}</h3>
      {value.adjustedPp !== null ? (
        <p>
          <strong className="bws-value">
            {new Intl.NumberFormat(tr.locale, {
              maximumFractionDigits: 2,
              notation: value.adjustedPp >= 1e12 ? "scientific" : "standard",
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
      <p className="small muted">
        <code>{"pp^(1.0063^(badges^2)/1)"}</code>
      </p>
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
      <p className="small muted">
        {value.reviewedAt
          ? tr("Staff-reviewed badge classification")
          : value.badgeCount === 0
            ? tr("Provider returned no profile badges")
            : tr("Tournament badge types are not supplied by osu!")}
        {value.reviewedAt && (
          <>
            {" "}
            · <time dateTime={value.reviewedAt}>{value.reviewedAt}</time>
          </>
        )}
      </p>
      <p className="small muted">
        {tr("Profile updated")}{" "}
        <time dateTime={value.fetchedAt}>{value.fetchedAt}</time>
        {value.stale && <> · {tr("Stale snapshot")}</>}
      </p>
    </section>
  );
}
