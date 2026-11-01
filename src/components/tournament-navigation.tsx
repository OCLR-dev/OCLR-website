"use client";

import { useAppTranslations } from "@/i18n/shared";

import Link from "./pending-link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  captainWorkspaceSection,
  playerWorkspaceSection,
  publicTournamentSection,
} from "@/lib/public-navigation";
import { supportsArchiveStatistics } from "@/lib/archive-statistics-model";
import styles from "./tournament-navigation.module.css";

function Navigation({
  slug,
  liveDraft,
  archived = false,
  mobileMenu = false,
}: {
  slug: string;
  liveDraft: boolean;
  archived?: boolean;
  mobileMenu?: boolean;
}) {
  const tr = useAppTranslations();

  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);
  const base = `/tournaments/${slug}`;
  const legacyLinks = [
    ["", "Overview"],
    ["schedule", archived ? "Matches & results" : "Schedule"],
    ["mappools", "Pools"],
    ["teams", "Teams"],
    ...(!archived ? [["results", "Results"]] : []),
    ["bracket", "Bracket"],
    ["players", "Players"],
    ...(liveDraft ? [["draft", "Live draft"]] : []),
    ...(archived ? [["draft", "Draft results"]] : []),
    ...(archived ? [["staff", "Staff"]] : []),
    ...(archived && supportsArchiveStatistics(slug)
      ? [["statistics", "Player statistics"]]
      : []),
  ];
  const links = mobileMenu
    ? [
        ["", "Main page"],
        ["players", "Players"],
        ["teams", "Teams"],
        ["draft", "Draft results"],
        ["schedule", "Schedule"],
        ["mappools", "Pools"],
        ...(!archived || supportsArchiveStatistics(slug)
          ? [["statistics", "Statistics"]]
          : []),
        ...(archived ? [["staff", "Staff"]] : []),
      ]
    : legacyLinks;
  const section = publicTournamentSection(pathname, base);
  const active = mobileMenu
    ? ["bracket", "results"].includes(section ?? "")
      ? "schedule"
      : section
    : section;
  return (
    <div
      ref={root}
      className="tournament-navigation"
      data-open={open || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      {mobileMenu && (
        <button
          ref={trigger}
          type="button"
          className="secondary tournament-menu"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {tr("Tournament menu ")}
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      )}
      <nav id={id} aria-label={tr("Tournament navigation")}>
        {links.map(([section, label]) => (
          <Link
            key={section}
            href={`${base}${section ? `/${section}` : ""}`}
            aria-current={active === section ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {tr(label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
export function TournamentNavigation(props: {
  slug: string;
  liveDraft: boolean;
  archived?: boolean;
  mobileMenu?: boolean;
}) {
  const path = usePathname();
  return <Navigation key={path} {...props} />;
}

/** Private tools use the sidebar; broadcast output retains its own appearance. */
export function TournamentShell({
  slug,
  name,
  liveDraft,
  archived = false,
  captainWorkspace,
  playerWorkspace = false,
  children,
}: {
  slug: string;
  name: string;
  liveDraft: boolean;
  archived?: boolean;
  captainWorkspace?: { scheduleRequests: boolean };
  playerWorkspace?: boolean;
  children: ReactNode;
}) {
  const tr = useAppTranslations();

  const path = usePathname();
  const search = useSearchParams();
  const base = `/tournaments/${slug}`;
  const captainSection = captainWorkspaceSection(path, base);
  const playerSection = playerWorkspaceSection(path, base);
  const privateView =
    (path === `${base}/draft` && search.get("presenter") === "1") ||
    captainSection !== null ||
    playerSection !== null ||
    path.includes("/draft/overlay");
  const shell = useRef<HTMLDivElement>(null);
  const context = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = shell.current;
    const bar = context.current;
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!node || !bar || !header) return;
    // Header controls can wrap with locale, appearance or viewport changes.
    // Share the measured stack with anchors, the rule index and mobile menu.
    const update = () => {
      const hidden =
        window.matchMedia("(max-width: 760px)").matches &&
        header.dataset.scrollHidden === "true";
      const headerHeight = hidden ? 0 : header.getBoundingClientRect().height;
      node.style.setProperty("--tournament-header-height", `${headerHeight}px`);
      node.style.setProperty(
        "--tournament-scroll-offset",
        `${headerHeight + bar.getBoundingClientRect().height + 16}px`,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    observer.observe(bar);
    const visibility = new MutationObserver(update);
    visibility.observe(header, {
      attributes: true,
      attributeFilter: ["data-scroll-hidden"],
    });
    return () => {
      observer.disconnect();
      visibility.disconnect();
    };
  }, [privateView]);
  if (privateView)
    return (
      <div className="container page workspace tournament-workspace">
        <aside className={`sidebar ${styles.sidebar}`}>
          <Link href="/tournaments" className="eyebrow">
            {tr("Tournaments")}
          </Link>
          <h2>{name}</h2>
          <TournamentNavigation
            slug={slug}
            liveDraft={liveDraft}
            archived={archived}
          />
          {captainWorkspace && (captainSection || playerSection) && (
            <section
              className={styles.captainSection}
              aria-labelledby="captain-workspace-heading"
            >
              <h3 id="captain-workspace-heading" className="eyebrow">
                {tr("CAPTAIN WORKSPACE")}
              </h3>
              <nav
                className={styles.links}
                aria-label={tr("CAPTAIN WORKSPACE")}
              >
                <Link
                  href={`${base}/team`}
                  aria-current={captainSection === "team" ? "page" : undefined}
                >
                  {tr("My team")}
                </Link>
                <Link
                  href={`${base}/draft/captain`}
                  aria-current={
                    captainSection === "draft/captain" ? "page" : undefined
                  }
                >
                  {tr("Captain draft room")}
                </Link>
                {captainWorkspace.scheduleRequests && (
                  <Link
                    href={`${base}/schedule/requests`}
                    aria-current={
                      captainSection === "schedule/requests"
                        ? "page"
                        : undefined
                    }
                  >
                    {tr("Schedule requests")}
                  </Link>
                )}
              </nav>
            </section>
          )}
          {playerWorkspace && (captainSection || playerSection) && (
            <section
              className={styles.captainSection}
              aria-labelledby="player-workspace-heading"
            >
              <h3 id="player-workspace-heading" className="eyebrow">
                {tr("PLAYER WORKSPACE")}
              </h3>
              <nav className={styles.links} aria-label={tr("PLAYER WORKSPACE")}>
                <Link
                  href={`${base}/player/practice`}
                  aria-current={
                    playerSection === "player/practice" ? "page" : undefined
                  }
                >
                  {tr("Practice sheet")}
                </Link>
                <Link
                  href={`${base}/player/availability`}
                  aria-current={
                    playerSection === "player/availability" ? "page" : undefined
                  }
                >
                  {tr("Season timetable")}
                </Link>
              </nav>
            </section>
          )}
        </aside>
        <div className="workspace-main">{children}</div>
      </div>
    );
  return (
    <div className="public-tournament" ref={shell}>
      <div className="event-context" ref={context}>
        <div className="event-identity">
          <Link href="/tournaments" className="context-link">
            {tr("Tournaments")}
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={base} className="context-link" title={name}>
            {name}
          </Link>
        </div>
        <TournamentNavigation
          slug={slug}
          liveDraft={liveDraft}
          archived={archived}
          mobileMenu
        />
        {(captainWorkspace || playerWorkspace) && (
          <Link
            className="button secondary"
            href={playerWorkspace ? `${base}/player/practice` : `${base}/team`}
          >
            {playerWorkspace ? tr("PLAYER WORKSPACE") : tr("CAPTAIN WORKSPACE")}
          </Link>
        )}
      </div>
      <div className="event-content">{children}</div>
    </div>
  );
}
