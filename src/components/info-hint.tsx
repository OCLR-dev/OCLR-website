"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import styles from "./info-hint.module.css";

type Anchor = { x: number; y: number; above: boolean };

/**
 * A small "i" trigger that reveals an explanation above the pointer, centred on
 * it. Keyboard focus anchors the same panel above the icon instead.
 */
export function InfoHint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const place = (x: number, y: number) => {
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? 0;
    const height = panel?.offsetHeight ?? 0;
    const margin = 12;
    const half = width / 2;
    const minX = half + margin;
    const maxX = Math.max(minX, window.innerWidth - half - margin);
    setAnchor({
      x: Math.min(Math.max(x, minX), maxX),
      y,
      above: y - height - margin >= margin,
    });
  };

  const showForFocus = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    place(rect.left + rect.width / 2, rect.top);
  };

  return (
    <span className={styles.hint}>
      <span
        ref={triggerRef}
        className={styles.trigger}
        tabIndex={0}
        aria-label={label}
        aria-describedby={id}
        onPointerEnter={(event) => place(event.clientX, event.clientY)}
        onPointerMove={(event) => place(event.clientX, event.clientY)}
        onPointerLeave={() => setAnchor(null)}
        onFocus={showForFocus}
        onBlur={() => setAnchor(null)}
      >
        i
      </span>
      <span
        ref={panelRef}
        id={id}
        role="note"
        className={`${styles.panel} ${anchor ? styles.open : ""} ${
          anchor?.above ? styles.above : styles.below
        }`}
        style={anchor ? { left: anchor.x, top: anchor.y } : undefined}
      >
        {children}
      </span>
    </span>
  );
}
