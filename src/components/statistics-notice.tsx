"use client";

import { useId, useRef, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import styles from "./statistics-notice.module.css";

export function StatisticsNotice({ children }: { children: ReactNode }) {
  const tr = useAppTranslations();
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  return (
    <div className={styles.notice}>
      <button
        type="button"
        className={styles.trigger}
        popoverTarget={id}
        aria-label={tr("Notes")}
        title={tr("Notes")}
        onClick={(event) => {
          if (!panel.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const top = Math.min(rect.bottom + 8, window.innerHeight / 2);
          panel.current.style.top = `${top}px`;
          panel.current.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 524))}px`;
          panel.current.style.maxHeight = `${window.innerHeight - top - 12}px`;
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="region"
        className={styles.panel}
        aria-label={tr("Notes")}
      >
        {children}
      </div>
    </div>
  );
}
