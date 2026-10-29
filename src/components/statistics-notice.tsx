"use client";

import type { ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";

export function StatisticsNotice({ children }: { children: ReactNode }) {
  const tr = useAppTranslations();
  return (
    <section className="info-note-box" aria-label={tr("Notes")}>
      {children}
    </section>
  );
}
