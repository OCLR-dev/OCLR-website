"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Rule anchors clear the shared header even when mobile preferences wrap. */
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
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!node || !header) return;
    const update = () =>
      node.style.setProperty(
        "--rules-scroll-offset",
        `${header.getBoundingClientRect().height + 16}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
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
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={section}
      id="rules"
      className="archive-overview-rules"
      aria-labelledby={titleId}
    >
      {children}
    </section>
  );
}
