"use client";
import { useAppTranslations } from "@/i18n/shared";
import type { PlayerClass } from "@/lib/player-class";
import type { PlayerRating } from "@/lib/yumu-rating";
import { playerClassLabels } from "@/lib/player-class-labels";
import styles from "./player-class.module.css";
export function PlayerClassBadge({
  classification,
  indices,
  showNotes = true,
}: {
  classification: PlayerClass | null;
  indices?: PlayerRating;
  showNotes?: boolean;
}) {
  const tr = useAppTranslations();
  const names = playerClassLabels(tr);
  if (!classification)
    return <span className="small">{tr("Insufficient comparison data")}</span>;
  const label = (
    <>
      {names[classification.code]}{" "}
      <span className="small">{classification.category}</span>
    </>
  );
  if (!showNotes)
    return (
      <span
        className={`${styles.badge} ${styles.static}`}
        data-category={classification.category}
      >
        {label}
      </span>
    );
  return (
    <details className={styles.evaluation}>
      <summary className={styles.badge} data-category={classification.category}>
        {label}
      </summary>
      <div className={styles.explanation}>
        <p>
          {names[classification.category]} · {classification.code}
        </p>
        <p>
          {tr(
            "Relative ERA, DRA and RWS ranks determine this category. Lower rank indices are better; equal values share a midrank.",
          )}
        </p>
        {indices && (
          <p>
            {["eraIndex", "draIndex", "rwsIndex"]
              .map(
                (key) =>
                  `${key}: ${indices[key as "eraIndex" | "draIndex" | "rwsIndex"]?.toFixed(4) ?? "—"}`,
              )
              .join(" · ")}
          </p>
        )}
        <p className="small">{classification.policy}</p>
      </div>
    </details>
  );
}
