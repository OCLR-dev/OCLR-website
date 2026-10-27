"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import {
  modeNames,
  profileModes,
  type ProfileMode,
} from "@/lib/osu-profile-model";
import menu from "./language-control.module.css";
import styles from "./profile-ruleset-filter.module.css";
import { LoadingOverlay } from "./loading-overlay";

/** Uses the same themed menu geometry and keyboard pattern as preferences. */
export function ProfileRulesetFilter({
  mode,
  edition,
}: {
  mode: ProfileMode;
  edition?: string;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(mode);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focus = useRef<ProfileMode>(mode);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>(`[data-mode="${focus.current}"]`)
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
    <div className="filters">
      <div className={`field ${styles.field}`}>
        <label id={`${id}-label`} htmlFor={`${id}-trigger`}>
          {tr("Ruleset")}
        </label>
        <div
          className={menu.root}
          ref={root}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setOpen(false);
          }}
        >
          <button
            id={`${id}-trigger`}
            type="button"
            className={`secondary ${menu.trigger} ${styles.trigger}`}
            ref={trigger}
            disabled={pending}
            aria-busy={pending}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-value`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={`${id}-menu`}
            onClick={() => {
              focus.current = value;
              setOpen(!open);
            }}
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
              event.preventDefault();
              focus.current =
                event.key === "ArrowUp"
                  ? profileModes[profileModes.length - 1]
                  : profileModes[0];
              setOpen(true);
            }}
          >
            <span id={`${id}-value`}>{modeNames[value]}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
          {open && (
            <div
              className={`${menu.menu} ${styles.menu}`}
              role="menu"
              aria-labelledby={`${id}-label`}
              id={`${id}-menu`}
              onKeyDown={keyboard}
            >
              {profileModes.map((option) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === option}
                  tabIndex={-1}
                  data-mode={option}
                  key={option}
                  onClick={() => {
                    setValue(option);
                    setOpen(false);
                    trigger.current?.focus();
                    if (option === mode) return;
                    const query = new URLSearchParams({ mode: option });
                    if (edition) query.set("edition", edition);
                    start(() => router.push(`?${query}`, { scroll: false }));
                  }}
                >
                  <span>{modeNames[option]}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    style={{
                      visibility: value === option ? "visible" : "hidden",
                    }}
                  >
                    <path d="m3 8 3 3 7-7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {pending && <LoadingOverlay />}
    </div>
  );
}
