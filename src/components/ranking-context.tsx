"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { useAppTranslations } from "@/i18n/shared";

import styles from "./ranking-context.module.css";

/** Context tabs that match the tournament event bar on the public ranking page. */
export function RankingContext({
  current = "performance",
}: {
  current?: "performance" | "career";
}) {
  const tr = useAppTranslations();
  const career = current === "career";
  const currentLabel = career ? tr("Career") : tr("Performance");
  const context = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = context.current;
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!bar || !header) return;
    const update = () => {
      const hidden =
        window.matchMedia("(max-width: 760px)").matches &&
        header.dataset.scrollHidden === "true";
      const headerHeight = hidden ? 0 : header.getBoundingClientRect().height;
      bar.style.setProperty("--tournament-header-height", `${headerHeight}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    const visibility = new MutationObserver(update);
    visibility.observe(header, {
      attributes: true,
      attributeFilter: ["data-scroll-hidden"],
    });
    return () => {
      observer.disconnect();
      visibility.disconnect();
    };
  }, []);
  return (
    <div ref={context} className={`event-context ${styles.context}`}>
      <div className="event-identity">
        <Link href="/ranking" className="context-link">
          {tr("Ranking")}
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={career ? "/ranking/career" : "/ranking/performance"}
          className="context-link"
          aria-current="page"
        >
          {currentLabel}
        </Link>
      </div>
      <nav className={styles.tabs} aria-label={tr("Player leaderboard")}>
        <Link
          href="/ranking/performance"
          aria-current={career ? undefined : "page"}
        >
          {tr("Performance")}
        </Link>
        <Link href="/ranking/career" aria-current={career ? "page" : undefined}>
          {tr("Career")}
        </Link>
        <button type="button" disabled title={tr("Coming soon")}>
          {tr("Beatmaps")}
        </button>
      </nav>
    </div>
  );
}
