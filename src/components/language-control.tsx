"use client";
import { LoadingOverlay } from "./loading-overlay";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { localeCookie, locales, type Locale } from "@/i18n/config";
import { useAppTranslations } from "@/i18n/shared";
import styles from "./language-control.module.css";

const names = { en: "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文" };
const shortNames = { en: "EN", "zh-Hans": "简", "zh-Hant": "繁" };
export function LanguageControl() {
  const locale = useLocale() as Locale;
  const tr = useAppTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef(locale);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>(
        `[data-locale="${initialFocus.current}"]`,
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
      className={`language-control ${styles.root}`}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {pending && <LoadingOverlay />}
      <button
        type="button"
        className={`secondary ${styles.trigger}`}
        ref={trigger}
        disabled={pending}
        aria-busy={pending}
        aria-label={`${tr("Language")}: ${shortNames[locale]} / ${names[locale]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          initialFocus.current = locale;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          event.preventDefault();
          initialFocus.current =
            event.key === "ArrowUp" ? locales[locales.length - 1] : locales[0];
          setOpen(true);
        }}
      >
        <span lang={locale} className={styles.fullName}>
          {names[locale]}
        </span>
        <span lang={locale} className={styles.shortName} aria-hidden="true">
          {shortNames[locale]}
        </span>
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
          className={styles.menu}
          id={id}
          role="menu"
          aria-label={tr("Language")}
          onKeyDown={keyboard}
        >
          {locales.map((value) => (
            <button
              type="button"
              key={value}
              role="menuitemradio"
              aria-checked={value === locale}
              tabIndex={-1}
              data-locale={value}
              lang={value}
              disabled={pending}
              onClick={() => {
                if (pending) return;
                setOpen(false);
                trigger.current?.focus();
                // Clicking the detected language still makes it a manual preference.
                document.cookie = `${localeCookie}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
                if (value === locale) return;
                start(() => router.refresh());
              }}
            >
              <span>{names[value]}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                style={{ visibility: value === locale ? "visible" : "hidden" }}
              >
                <path d="m3 8 3 3 7-7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
