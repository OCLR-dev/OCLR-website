"use client";
import { useAppTranslations } from "@/i18n/shared";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import {
  systemThemeCookie,
  systemThemeQuery,
  themeCookie,
  type Theme,
  type ThemePreference,
} from "@/lib/preferences";
// Preference menus share geometry and focus styling.
import styles from "./language-control.module.css";

const preferences = ["system", "light", "dark"] as const;
function subscribe(change: () => void) {
  const query = window.matchMedia?.(systemThemeQuery);
  query?.addEventListener("change", change);
  return () => query?.removeEventListener("change", change);
}
function currentSystemTheme(): Theme {
  return window.matchMedia?.(systemThemeQuery).matches ? "dark" : "light";
}
function cookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
function ThemeIcon({ value }: { value: ThemePreference }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {value === "system" ? (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M9 20h6m-3-4v4" />
        </>
      ) : value === "dark" ? (
        <path d="M20 14a8.5 8.5 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </>
      )}
    </svg>
  );
}

export function ThemeControl({
  initialPreference,
  initialSystemTheme,
}: {
  initialPreference: ThemePreference;
  initialSystemTheme: Theme;
}) {
  const tr = useAppTranslations();
  const [preference, setPreference] = useState(initialPreference);
  // The chosen mode stays separate from the brightness currently in effect.
  const systemTheme = useSyncExternalStore(
    subscribe,
    currentSystemTheme,
    () => initialSystemTheme,
  );
  const theme = preference === "system" ? systemTheme : preference;
  // Reads the live query: during hydration systemTheme is still the server's
  // hint. Also restores the attribute after React's development remount.
  useLayoutEffect(() => {
    const system = currentSystemTheme();
    document.documentElement.dataset.theme =
      preference === "system" ? system : preference;
    document.documentElement.dataset.themePreference = preference;
    if (typeof window.matchMedia === "function")
      cookie(systemThemeCookie, system, 31536000);
  }, [preference, systemTheme]);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const focus = useRef<ThemePreference>(preference),
    id = useId();
  const name = (value: ThemePreference) =>
    value === "system"
      ? tr("Follow system")
      : value === "dark"
        ? tr("Dark")
        : tr("Light");
  const current =
    preference === "system"
      ? tr("Follow system ({value0})", { value0: name(theme) })
      : name(preference);
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>(
        `[data-theme-option="${focus.current}"]`,
      )
      ?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const items = [
      ...root.current!.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % items.length
            : event.key === "ArrowUp"
              ? (index - 1 + items.length) % items.length
              : -1;
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
    if (event.key === "Tab") setOpen(false);
  }
  return (
    <div
      className={`theme-menu ${styles.root}`}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="secondary theme-control"
        ref={trigger}
        aria-label={tr("Color mode: {value0}", { value0: current })}
        title={tr("Color mode: {value0}", { value0: current })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          focus.current = preference;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          event.preventDefault();
          focus.current = event.key === "ArrowUp" ? "dark" : "system";
          setOpen(true);
        }}
      >
        <ThemeIcon value={preference} />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={tr("Color mode")}
          className={styles.menu}
          onKeyDown={keyboard}
        >
          {preferences.map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === preference}
              tabIndex={-1}
              data-theme-option={value}
              onClick={() => {
                // Following the system clears the manual choice; it is never saved as one.
                cookie(
                  themeCookie,
                  value === "system" ? "" : value,
                  value === "system" ? 0 : 31536000,
                );
                setPreference(value);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <ThemeIcon value={value} />
              <span>{name(value)}</span>
              <span aria-hidden="true">{value === preference ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
