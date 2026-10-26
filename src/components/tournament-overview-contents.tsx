"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";

export type OverviewContentsEntry = {
  id: string;
  label: string;
  chapters?: { id: string; label: string }[];
};

/** The server supplies the same sections that it renders in the document. */
export function TournamentOverviewContents({
  entries,
}: {
  entries: OverviewContentsEntry[];
}) {
  const tr = useAppTranslations();
  const root = useRef<HTMLElement>(null);
  const ids = useMemo(
    () =>
      entries.flatMap((entry) => [
        entry.id,
        ...(entry.chapters ?? []).map((chapter) => chapter.id),
      ]),
    [entries],
  );
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const tournament = root.current?.closest<HTMLElement>(".public-tournament");
    let frame = 0;
    function update() {
      frame = 0;
      const offset = tournament
        ? parseFloat(
            getComputedStyle(tournament).getPropertyValue(
              "--tournament-scroll-offset",
            ),
          ) || 100
        : 100;
      let current = ids[0];
      for (const id of ids) {
        const target = document.getElementById(id);
        if (target && target.getBoundingClientRect().top <= offset + 1)
          current = id;
      }
      setActive(current);
    }
    function scheduleUpdate() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const observer = new ResizeObserver(scheduleUpdate);
    if (tournament) observer.observe(tournament);
    const header = document.querySelector<HTMLElement>(".site-header");
    const context = tournament?.querySelector<HTMLElement>(".event-context");
    if (header) observer.observe(header);
    if (context) observer.observe(context);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [ids]);

  function link(entry: { id: string; label: string }, index?: number) {
    return (
      <a
        href={`#${entry.id}`}
        aria-current={active === entry.id ? "location" : undefined}
        onClick={(event) => {
          setActive(entry.id);
          event.currentTarget.closest("details")?.removeAttribute("open");
          document.getElementById(entry.id)?.focus({ preventScroll: true });
        }}
      >
        {index !== undefined && (
          <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        )}
        {entry.label}
      </a>
    );
  }

  function contents() {
    return (
      <nav aria-label={tr("On this page")}>
        <ol className="overview-contents-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              {link(entry)}
              {entry.chapters && entry.chapters.length > 0 && (
                <ol className="overview-contents-chapters">
                  {entry.chapters.map((chapter, index) => (
                    <li key={chapter.id}>{link(chapter, index)}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  return (
    <>
      <aside
        ref={root}
        className="rules-desktop-contents information-overview-contents"
      >
        <p className="eyebrow">{tr("Contents")}</p>
        {contents()}
      </aside>
      <details className="rules-mobile-contents information-overview-contents">
        <summary>{tr("On this page")}</summary>
        {contents()}
      </details>
    </>
  );
}
