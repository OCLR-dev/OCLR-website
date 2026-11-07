"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppTranslations } from "@/i18n/shared";
import { beatmapLinks } from "@/lib/beatmap-links";
import {
  beatmapDownloadMirrors,
  type BeatmapMirror,
} from "@/lib/mappool-download";
import { BeatmapMirrorIcon } from "./beatmap-mirror-icon";

function ActionIcon({ kind }: { kind: "web" | "direct" }) {
  if (kind === "direct")
    return (
      // Font Awesome Free 5.15.4, solid/download (CC BY 4.0).
      // Same icon as osu-web's direct button; see LICENSES/Font-Awesome-Free.md.
      <svg
        width="18"
        height="18"
        viewBox="0 0 512 512"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z" />
      </svg>
    );
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3h7v7m0-7L11 13" />
      <path d="M10 5H4v15h15v-6" />
    </svg>
  );
}

function MirrorMenu({
  mirrors,
  label,
  searchLabel,
  compact,
  name,
}: {
  mirrors: BeatmapMirror[];
  label: string;
  searchLabel: string;
  compact: boolean;
  name?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      if (!trigger.current || !menu.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const { offsetWidth, offsetHeight } = menu.current;
      const { clientWidth, clientHeight } = document.documentElement;
      const left = Math.max(
        12,
        Math.min(rect.left, clientWidth - offsetWidth - 12),
      );
      const below = rect.bottom + 4;
      const above = rect.top - offsetHeight - 4;
      const top = below + offsetHeight <= clientHeight - 12 ? below : above;
      menu.current.style.left = `${left}px`;
      menu.current.style.top = `${Math.max(12, Math.min(top, clientHeight - offsetHeight - 12))}px`;
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={id}
        className="button secondary beatmap-mirror-trigger"
        aria-label={name ? `${label} · ${name}` : label}
        title={compact ? label : undefined}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v18M8 5 3 19h5ZM16 5l5 14h-5Z" />
        </svg>
        <span className={compact ? "sr-only" : undefined}>{label}</span>
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className="beatmap-mirror-menu"
        onToggle={(event) =>
          setOpen(event.currentTarget.matches(":popover-open"))
        }
      >
        {mirrors.map((mirror) => (
          <a
            key={mirror.href}
            href={mirror.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => menu.current?.hidePopover()}
          >
            <BeatmapMirrorIcon mirror={mirror} />
            <span>{mirror.name}</span>
            {mirror.search && (
              <span className="beatmap-mirror-search">{searchLabel}</span>
            )}
          </a>
        ))}
      </div>
    </>
  );
}

export function BeatmapActions({
  beatmapId,
  setId,
  searchTitle,
  downloadMirror,
  originalBeatmapId,
  originalSetId,
  beatmapMissing = false,
  preferOriginal = false,
  compact = false,
  showWeb = true,
  name,
  extra,
}: {
  beatmapId: number | null | undefined;
  setId: number | null | undefined;
  searchTitle?: string | null;
  downloadMirror?: string | null;
  originalBeatmapId?: number | null;
  originalSetId?: number | null;
  beatmapMissing?: boolean;
  preferOriginal?: boolean;
  compact?: boolean;
  showWeb?: boolean;
  name?: string;
  extra?: ReactNode;
}) {
  const tr = useAppTranslations();
  const originalLinks = beatmapLinks(originalBeatmapId, originalSetId);
  // Confirmed archive corrections may prefer the surviving original even if a
  // cached set exists or provider lookup is unavailable. Otherwise retain the
  // missing-edit fallback. Difficulty IDs and set destinations stay distinct.
  const useOriginal =
    (preferOriginal || (beatmapMissing && !setId)) &&
    !!(originalLinks.web || originalLinks.direct);
  const links = useOriginal ? originalLinks : beatmapLinks(beatmapId, setId);
  const mirrors = beatmapDownloadMirrors(
    useOriginal ? originalSetId : setId,
    downloadMirror,
    searchTitle,
  );
  const labels = useOriginal
    ? {
        web: tr("Open original map on osu!"),
        direct: tr("osu!direct (original map)"),
      }
    : {
        web: tr("Open on osu!"),
        direct: tr("osu!direct"),
      };
  return (
    <div
      className={`beatmap-actions${compact ? " beatmap-actions-compact" : ""}`}
    >
      {extra}
      <MirrorMenu
        mirrors={mirrors}
        label={tr("Download mirror")}
        searchLabel={tr("Search")}
        compact={compact}
        name={name}
      />
      {!compact && !links.web && mirrors.every((mirror) => mirror.search) && (
        <p className="muted small">{tr("Beatmap ID unresolved")}</p>
      )}
      {(["direct", "web"] as const).map(
        (kind) =>
          links[kind] &&
          (kind !== "web" || showWeb) && (
            <a
              key={kind}
              href={links[kind]!}
              // The web (secondary) action is a normal https page; open it in a
              // new tab so the current mappool view is not navigated away from.
              target={kind === "web" ? "_blank" : undefined}
              rel={kind === "web" ? "noopener noreferrer" : undefined}
              className={`button${kind === "direct" && !compact ? "" : " secondary"}`}
              aria-label={name ? `${labels[kind]} · ${name}` : labels[kind]}
              title={compact ? labels[kind] : undefined}
            >
              <ActionIcon kind={kind} />
              <span className={compact ? "sr-only" : undefined}>
                {labels[kind]}
              </span>
            </a>
          ),
      )}
    </div>
  );
}
