"use client";

import { useAppTranslations } from "@/i18n/shared";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Avatar } from "./avatar";
import { OclrLogo } from "./oclr-logo";
import { ThemeControl } from "./theme-control";
import type { Theme, Appearance } from "@/lib/preferences";
import { AppearanceControl } from "./appearance-control";
import { LanguageControl } from "./language-control";
type Account = {
  osuId: number;
  username: string;
  staff?: boolean;
  developer?: boolean;
};
function AccountControl({
  user,
  path,
  onOpen,
}: {
  user: Account;
  path: string;
  onOpen: () => void;
}) {
  const tr = useAppTranslations();

  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const last = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const items =
      root.current!.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]');
    items[last.current ? items.length - 1 : 0]?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const content = (
    <>
      <Avatar osuId={user.osuId} username={user.username} />
      <span className="account-label">{tr("Dashboard")}</span>
    </>
  );
  if (!user.staff)
    return (
      <Link
        href="/dashboard"
        className="button secondary account-control"
        aria-label={tr("Dashboard")}
        title={user.username}
        aria-current={
          path === "/dashboard" || path.startsWith("/dashboard/")
            ? "page"
            : undefined
        }
        onClick={onOpen}
      >
        {content}
      </Link>
    );
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const items = [
      ...root.current!.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]'),
    ];
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % items.length
            : event.key === "ArrowUp"
              ? (current - 1 + items.length) % items.length
              : -1;
    if (index >= 0) {
      event.preventDefault();
      items[index]?.focus();
    }
    if (event.key === "Tab") setOpen(false);
    if (event.key === " ") {
      event.preventDefault();
      (event.target as HTMLAnchorElement).click();
    }
  }
  return (
    <div
      className="account-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="secondary account-control"
        aria-label={tr("Dashboard")}
        ref={trigger}
        title={user.username}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        data-active={
          path === "/dashboard" ||
          path.startsWith("/dashboard/") ||
          path === "/admin" ||
          path.startsWith("/admin/") ||
          path === "/developer" ||
          undefined
        }
        onClick={() => {
          last.current = false;
          onOpen();
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            last.current = event.key === "ArrowUp";
            onOpen();
            setOpen(true);
          }
        }}
      >
        {content}
        <svg
          aria-hidden="true"
          className="account-chevron"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div
          className="account-dropdown"
          id={id}
          role="menu"
          aria-label={tr("Dashboards")}
          onKeyDown={keyboard}
        >
          {[
            ["/dashboard", "Player dashboard"],
            ["/admin", "Staff dashboard"],
            ...(user.developer ? [["/developer", "Developer API access"]] : []),
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              tabIndex={-1}
              aria-current={
                path === href || path.startsWith(`${href}/`)
                  ? "page"
                  : undefined
              }
              onClick={() => setOpen(false)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {href === "/admin" ? (
                  <path d="m10 2 6 2.5V9c0 4-3 7-6 9-3-2-6-5-6-9V4.5L10 2Z" />
                ) : (
                  <>
                    <circle cx="10" cy="6" r="3" />
                    <path d="M4 17v-1a6 6 0 0 1 12 0v1" />
                  </>
                )}
              </svg>
              <span>{tr(label)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
export function Header({
  remote = false,
  informationHref = "/tournaments",
  user,
  theme,
  appearance = "default",
  defaultAppearance = "default",
  appearancePreference,
}: {
  remote?: boolean;
  informationHref?: string;
  user: Account | null;
  theme: Theme;
  appearance?: Appearance;
  defaultAppearance?: Appearance;
  appearancePreference?: Appearance;
}) {
  const tr = useAppTranslations();

  const links = [
    { href: "/", label: tr("navigation_home") },
    { href: informationHref, label: tr("Information page") },
    { href: "/news", label: tr("Tournament news") },
    { href: "/wiki", label: tr("OCLR Wiki") },
    { href: "/about", label: tr("Organizers") },
  ];
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !navigation.current?.contains(target) &&
        !menuTrigger.current?.contains(target)
      )
        setOpen(false);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      menuTrigger.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link href="/" className="brand" aria-label={tr("OCLR home")}>
          <OclrLogo />
        </Link>
        <button
          type="button"
          ref={menuTrigger}
          className="menu-toggle secondary"
          aria-label={open ? tr("Close") : tr("Menu")}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path
              d={open ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"}
            />
          </svg>
        </button>
        <nav
          id="main-navigation"
          ref={navigation}
          aria-label={tr("Main navigation")}
          className={open ? "main-nav open" : "main-nav"}
        >
          {links.map(({ href, label }) =>
            href === null ? (
              <a
                key={label}
                role="link"
                aria-disabled="true"
                className="nav-unavailable"
              >
                {label}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                aria-current={
                  (
                    href === "/"
                      ? path === "/"
                      : path === href || path.startsWith(`${href}/`)
                  )
                    ? "page"
                    : undefined
                }
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ),
          )}
        </nav>
        <div className="site-preferences" onFocusCapture={() => setOpen(false)}>
          <AppearanceControl
            key={`${defaultAppearance}:${appearancePreference ?? "site"}`}
            initialAppearance={appearance}
            defaultAppearance={defaultAppearance}
            initialPreference={appearancePreference}
          />
          <ThemeControl initialTheme={theme} />
          <LanguageControl />
        </div>
        <div
          className="nav-actions"
          role="group"
          aria-label={tr("Account actions")}
        >
          {remote ? (
            <Link
              href="/remote"
              className="button secondary account-control"
              aria-label={tr("Remote connection")}
              title={tr("Remote connection")}
            >
              {user && <Avatar osuId={user.osuId} username={user.username} />}
              {!user && (
                <svg
                  className="account-connection-icon"
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />
                </svg>
              )}
              <span className="account-label">
                {user?.username ?? tr("Remote connection")}
              </span>
            </Link>
          ) : user ? (
            <AccountControl
              key={path}
              user={user}
              path={path}
              onOpen={() => setOpen(false)}
            />
          ) : (
            <Link
              href="/login"
              className="button nav-login"
              aria-label={tr("Login with osu!")}
              aria-current={path === "/login" ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <span className="login-label">{tr("Login with osu!")}</span>
              <span className="login-short" aria-hidden="true">
                osu!
              </span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
