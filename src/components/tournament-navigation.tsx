"use client";

import { useAppTranslations } from "@/i18n/shared";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";
import { publicTournamentSection } from "@/lib/public-navigation";

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
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
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
    ...(archived && ["s7", "s8", "s9", "s10"].includes(slug)
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
        ["statistics", "Statistics"],
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
    <div className="public-tournament">
      <div className="event-context">
        <div className="event-identity">
          <Link href="/tournaments" className="context-link">
            {tr("Tournaments")}
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={base} className="context-link">
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
