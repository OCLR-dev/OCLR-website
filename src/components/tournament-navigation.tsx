"use client";

import { useAppTranslations } from "@/i18n/shared";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { publicTournamentSection } from "@/lib/public-navigation";
import { supportsArchiveStatistics } from "@/lib/archive-statistics-model";

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
    ["mappools", "Mappools"],
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
        ["mappools", "Mappools"],
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

/** Private captain tools and OBS retain the existing dark workspace. */
export function TournamentShell({
  slug,
  name,
  liveDraft,
  archived = false,
  children,
}: {
  slug: string;
  name: string;
  liveDraft: boolean;
  archived?: boolean;
  children: ReactNode;
}) {
  const tr = useAppTranslations();

  const path = usePathname();
  const search = useSearchParams();
  const base = `/tournaments/${slug}`;
  const privateView =
    (path === `${base}/draft` && search.get("presenter") === "1") ||
    path === `${base}/team` ||
    path.startsWith(`${base}/draft/captain`) ||
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
      const headerHeight = header.getBoundingClientRect().height;
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
    return () => observer.disconnect();
  }, [privateView]);
  if (privateView)
    return (
      <div className="container page workspace tournament-workspace">
        <aside className="sidebar">
          <Link href="/tournaments" className="eyebrow">
            {tr("Tournaments")}
          </Link>
          <h2>{name}</h2>
          <TournamentNavigation
            slug={slug}
            liveDraft={liveDraft}
            archived={archived}
          />
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
      </div>
      <div className="event-content">{children}</div>
    </div>
  );
}
