"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import styles from "./mappool-replay-player.module.css";

export function MappoolReplayDialog({
  id,
  slot,
  map,
  onClose,
  children,
}: {
  id: string;
  slot: string;
  map: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const tr = useAppTranslations();
  const panel = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const dialog = panel.current;
    if (dialog && !dialog.open) dialog.showModal();
    heading.current?.focus();
  }, []);

  return (
    <dialog
      ref={panel}
      id={id}
      className={styles.viewer}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-map`}
      onClose={onClose}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h3 ref={heading} tabIndex={-1} id={`${id}-title`}>
            {tr("Replay player for {value0}", { value0: slot })}
          </h3>
          <p id={`${id}-map`}>{map}</p>
        </div>
        <button
          type="button"
          className="secondary"
          aria-label={tr("Close player")}
          onClick={() => panel.current?.close()}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      {children}
    </dialog>
  );
}
