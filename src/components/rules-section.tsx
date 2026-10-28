"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Align direct rule links after the tournament shell measures its sticky bars. */
export function RulesSection({
  children,
  titleId,
}: {
  children: ReactNode;
  titleId: string;
}) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = section.current;
    if (!node) return;
    let target: HTMLElement | null = null;
    try {
      target = document.getElementById(
        decodeURIComponent(window.location.hash.slice(1)),
      );
    } catch {
      /* A malformed fragment has no matching chapter. */
    }
    if (target && node.contains(target))
      target.scrollIntoView({ block: "start" });
  }, []);
  return (
    <section
      ref={section}
      id="rules"
      tabIndex={-1}
      className="archive-overview-rules"
      aria-labelledby={titleId}
    >
      {children}
    </section>
  );
}
