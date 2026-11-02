"use client";

import { useAppTranslations } from "@/i18n/shared";

import { LoadingOverlay } from "./loading-overlay";
import { StaffReadOnlyContext } from "./staff-read-only";
import Link from "./pending-link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import {
  activeAdminLink,
  adminBreadcrumbs,
  type AdminLink,
} from "@/lib/admin-navigation";
type Workspace = {
  slug: string;
  name: string;
  status: string;
  published: boolean;
  links: AdminLink[];
};
export function StaffNavigation({
  globalLinks,
  editions,
  username,
  readOnly: developer = false,
  writablePaths = [],
  children,
}: {
  globalLinks: AdminLink[];
  editions: Workspace[];
  username: string;
  readOnly?: boolean;
  writablePaths?: string[];
  children: ReactNode;
}) {
  const tr = useAppTranslations();

  const pathname = usePathname();
  const refereeWorkspace =
    /^\/admin\/tournaments\/[^/]+\/matches\/[^/]+\/referee\/?$/.test(pathname);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const readOnly =
    developer &&
    !writablePaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  function closeMobileMenu() {
    setOpenPath(null);
    if (open) mobileToggle.current?.focus({ preventScroll: true });
  }
  const selected = editions.find(
    (e) =>
      pathname === `/admin/tournaments/${e.slug}` ||
      pathname.startsWith(`/admin/tournaments/${e.slug}/`),
  );
  const links = selected ? selected.links : globalLinks;
  const active = activeAdminLink(pathname, links);
  const crumbs = adminBreadcrumbs(pathname, selected);
  return (
    <StaffReadOnlyContext value={readOnly}>
      <div
        className="container page workspace admin-workspace"
        data-sidebar-collapsed={sidebarCollapsed}
        style={
          refereeWorkspace
            ? { gridTemplateColumns: "minmax(0, 1fr)" }
            : undefined
        }
      >
        {pending && <LoadingOverlay />}
        <div className="admin-workspace-toolbar">
          {!refereeWorkspace &&
            [
              { mobile: false, expanded: !sidebarCollapsed },
              { mobile: true, expanded: open },
            ].map(({ mobile, expanded }) => (
              <button
                key={String(mobile)}
                ref={mobile ? mobileToggle : undefined}
                type="button"
                className={`secondary admin-menu-toggle admin-menu-toggle-${mobile ? "mobile" : "desktop"}`}
                aria-controls="admin-sidebar"
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? tr("Close administration menu")
                    : tr("Open administration menu")
                }
                title={
                  expanded
                    ? tr("Close administration menu")
                    : tr("Open administration menu")
                }
                onClick={() =>
                  mobile
                    ? setOpenPath(open ? null : pathname)
                    : setSidebarCollapsed((collapsed) => !collapsed)
                }
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            ))}
          <nav className="admin-breadcrumbs" aria-label={tr("Breadcrumb")}>
            <ol>
              {crumbs.map((crumb, i) => (
                <li key={crumb.href}>
                  {i === crumbs.length - 1 ? (
                    <span aria-current="page">
                      {crumb.label === selected?.name
                        ? crumb.label
                        : tr(crumb.label)}
                    </span>
                  ) : (
                    <Link href={crumb.href}>
                      {crumb.label === selected?.name
                        ? crumb.label
                        : tr(crumb.label)}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
        {!refereeWorkspace && (
          <aside
            id="admin-sidebar"
            className={`sidebar${open ? " is-open" : ""}`}
            onKeyDown={(event) => {
              if (event.key === "Escape" && open) {
                event.preventDefault();
                closeMobileMenu();
              }
            }}
          >
            {!selected && <p className="eyebrow">{tr("ADMINISTRATION")}</p>}
            {selected ? (
              <div className="admin-context">
                <div className="admin-context-heading">
                  <span className="muted small">{tr("Tournament")}</span>
                  {!selected.published ? (
                    <span className="badge">{tr("Draft")}</span>
                  ) : selected.status === "live" ? (
                    <span className="badge">{tr("Live")}</span>
                  ) : null}
                </div>
                <label className="field">
                  <span className="sr-only">{tr("Selected tournament")}</span>
                  <select
                    aria-label={tr("Selected tournament")}
                    disabled={pending}
                    aria-busy={pending}
                    value={selected.slug}
                    onChange={(event) => {
                      closeMobileMenu();
                      const next = editions.find(
                        (edition) => edition.slug === event.target.value,
                      );
                      if (next)
                        startTransition(() =>
                          router.push(`/admin/tournaments/${next.slug}`),
                        );
                    }}
                  >
                    {editions.map((e) => (
                      <option key={e.slug} value={e.slug}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Link
                  href="/admin/tournaments"
                  className="button secondary admin-return"
                  onClick={closeMobileMenu}
                >
                  {tr("← All tournaments")}
                </Link>
              </div>
            ) : (
              <h2>{tr("OCLR operations")}</h2>
            )}
            <div className="admin-menu">
              <nav
                aria-label={
                  selected
                    ? tr("Tournament navigation")
                    : tr("Administration navigation")
                }
              >
                {[...new Set(links.map((link) => link.group))].map((group) => (
                  <div className="admin-nav-group" key={group}>
                    {!(selected && group === "Tournament") && (
                      <p className="eyebrow">{tr(group)}</p>
                    )}
                    {links
                      .filter((link) => link.group === group)
                      .map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          aria-current={
                            active?.href === link.href ? "page" : undefined
                          }
                          onClick={closeMobileMenu}
                        >
                          {tr(link.label)}
                        </Link>
                      ))}
                  </div>
                ))}
              </nav>
              <p className="admin-identity muted small">
                {tr("Signed in as ")}
                {username}
              </p>
            </div>
          </aside>
        )}
        <div className="workspace-main">
          {developer && (
            <p className="notice" role="status">
              {readOnly
                ? tr("Developer access is read-only.")
                : tr("Existing write roles remain active.")}{" "}
              {tr(
                "Developer grants no business writes or sensitive bulk exports. Other roles retain their existing permissions within scope.",
              )}
            </p>
          )}
          {children}
        </div>
      </div>
    </StaffReadOnlyContext>
  );
}
