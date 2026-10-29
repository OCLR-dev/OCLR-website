"use client";
import { appearanceLabel } from "@/i18n/appearance";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  appearanceCookie,
  publicAppearances,
  isPublicAppearance,
  type Appearance,
} from "@/lib/preferences";
import { useAppearanceScope } from "./appearance-provider";
import { useAppTranslations } from "@/i18n/shared";
// Preference menus share geometry and focus styling.
import styles from "./language-control.module.css";

export function AppearanceControl({
  initialAppearance,
  defaultAppearance = "default",
  initialPreference,
}: {
  initialAppearance: Appearance;
  defaultAppearance?: Appearance;
  initialPreference?: Appearance;
}) {
  const tr = useAppTranslations();
  const scope = useAppearanceScope();
  const [localAppearance, setAppearance] = useState(initialAppearance);
  const [localPreference, setPreference] = useState<Appearance | "site">(
    isPublicAppearance(initialPreference) ? initialPreference : "site",
  );
  const appearance = scope?.appearance ?? localAppearance;
  const preference = scope ? (scope.preference ?? "site") : localPreference;
  const inheritedDefault = scope?.inheritedDefault ?? defaultAppearance;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const focus = useRef<Appearance | "site">(preference),
    id = useId();
  const name = (value: Appearance | "site") =>
    value === "site"
      ? scope?.edition
        ? tr("Use tournament/site default")
        : tr("Use site default")
      : appearanceLabel(value, tr);
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>(
        `[data-appearance-option="${focus.current}"]`,
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
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
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
  }
  return (
    <div
      className={`appearance-control ${styles.root}`}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="secondary appearance-trigger"
        ref={trigger}
        aria-label={tr("Website appearance")}
        title={`${tr("Website appearance")}: ${name(appearance)}`}
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
          focus.current =
            event.key === "ArrowUp"
              ? publicAppearances[publicAppearances.length - 1]
              : "site";
          setOpen(true);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z" />
          <circle cx="7.5" cy="10" r=".8" />
          <circle cx="11" cy="7" r=".8" />
          <circle cx="15.5" cy="8" r=".8" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={tr("Website appearance")}
          className={styles.menu}
          onKeyDown={keyboard}
        >
          {(["site", ...publicAppearances] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === preference}
              tabIndex={-1}
              data-appearance-option={value}
              onClick={() => {
                const effective = value === "site" ? inheritedDefault : value;
                scope?.choose(value === "site" ? undefined : value);
                document.documentElement.dataset.appearance = effective;
                document.cookie = `${appearanceCookie}=${value === "site" ? "" : value}; Path=/; Max-Age=${value === "site" ? 0 : 31536000}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
                setPreference(value);
                setAppearance(effective);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span>{name(value)}</span>
              <span aria-hidden="true">{value === preference ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
