"use client";

import { useAppTranslations } from "@/i18n/shared";
import styles from "./loading-overlay.module.css";

/** Opt-in foreground loading. Background reads never mount this overlay. */
export function LoadingOverlay() {
  const tr = useAppTranslations();
  return (
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={tr("Loading…")}
    >
      <span className={styles.spinner} aria-hidden="true" />
    </div>
  );
}
