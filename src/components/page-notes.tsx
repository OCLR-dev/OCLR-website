"use client";

import { Children, useId, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import styles from "./page-notes.module.css";

/** Page-local public explanations, rendered after the content they qualify. */
export function PageNotes({ children }: { children?: ReactNode }) {
  const tr = useAppTranslations();
  const title = useId();
  const notes = Children.toArray(children).filter((note) => note !== "");
  if (!notes.length) return null;
  return (
    <section className={`page-notes ${styles.notes}`} aria-labelledby={title}>
      <h2 id={title}>{tr("Notes")}</h2>
      {notes}
    </section>
  );
}
