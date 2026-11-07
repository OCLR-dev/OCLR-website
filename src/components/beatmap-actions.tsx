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

function ActionIcon({ kind }: { kind: "download" | "direct" | "web" }) {
  if (kind === "direct")
    return (
      // Preserve the official single-colour osu! cookie outlines.
      <svg
        width="18"
        height="18"
        viewBox="0 0 350 350"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M100.1,206.4c-4.7,0-8.8-0.8-12.3-2.3s-6.4-3.7-8.6-6.4 c-2.3-2.7-4-5.9-5.2-9.6c-1.2-3.7-1.7-7.6-1.7-11.9c0-4.3,0.6-8.3,1.7-12c1.2-3.7,2.9-7,5.2-9.7c2.3-2.7,5.2-4.9,8.6-6.5 s7.6-2.4,12.3-2.4c4.7,0,8.8,0.8,12.3,2.4c3.5,1.6,6.4,3.7,8.8,6.5c2.3,2.7,4,6,5.2,9.7c1.1,3.7,1.7,7.7,1.7,12 c0,4.3-0.6,8.2-1.7,11.9c-1.1,3.7-2.8,6.9-5.2,9.6c-2.3,2.7-5.2,4.9-8.8,6.4C109,205.7,104.8,206.4,100.1,206.4z M100.1,194.3 c4.2,0,7.2-1.6,9-4.7c1.8-3.1,2.7-7.6,2.7-13.4c0-5.8-0.9-10.3-2.7-13.4c-1.8-3.1-4.8-4.7-9-4.7c-4.1,0-7.1,1.6-8.9,4.7 c-1.8,3.1-2.7,7.6-2.7,13.4c0,5.8,0.9,10.3,2.7,13.4C93,192.8,96,194.3,100.1,194.3z M151.9,179.8c-4.2-1.2-7.5-3-9.8-5.3 c-2.4-2.4-3.5-5.9-3.5-10.6c0-5.7,2-10.1,6.1-13.4c4.1-3.2,9.6-4.8,16.7-4.8c2.9,0,5.8,0.3,8.6,0.8c2.8,0.5,5.7,1.3,8.6,2.4 c-0.2,1.9-0.5,4-1.1,6.1c-0.6,2.1-1.3,3.9-2.1,5.5c-1.8-0.7-3.8-1.4-5.9-2c-2.2-0.6-4.5-0.8-6.8-0.8c-2.5,0-4.5,0.4-5.9,1.2 c-1.4,0.8-2.1,2-2.1,3.8c0,1.6,0.5,2.8,1.5,3.5c1,0.7,2.4,1.3,4.3,1.9l6.4,1.9c2.1,0.6,4,1.3,5.7,2.2c1.7,0.9,3.1,1.9,4.3,3.2 c1.2,1.3,2.1,2.8,2.8,4.7c0.7,1.9,1,4.2,1,6.8c0,2.8-0.6,5.3-1.7,7.7c-1.2,2.4-2.8,4.5-5,6.2c-2.2,1.8-4.9,3.1-8,4.2 c-3.1,1-6.7,1.5-10.7,1.5c-1.8,0-3.4-0.1-4.9-0.2c-1.5-0.1-2.9-0.3-4.3-0.6c-1.4-0.3-2.7-0.6-4.1-1c-1.3-0.4-2.8-0.9-4.4-1.5 c0.1-2,0.5-4.1,1.1-6.1c0.6-2.1,1.3-4.1,2.2-6c2.5,1,4.8,1.7,7,2.2c2.2,0.5,4.5,0.7,6.9,0.7c1,0,2.2-0.1,3.4-0.3 c1.2-0.2,2.4-0.5,3.4-1c1-0.5,1.9-1.1,2.6-1.9c0.7-0.8,1.1-1.8,1.1-3.1c0-1.8-0.5-3.1-1.6-3.9c-1.1-0.8-2.6-1.5-4.5-2.1L151.9,179.8 z M191.2,147.1c2.7-0.4,5.3-0.7,8-0.7c2.6,0,5.3,0.2,8,0.7v30.7c0,3.1,0.2,5.6,0.7,7.6c0.5,2,1.2,3.6,2.2,4.7c1,1.2,2.3,2,3.8,2.5 c1.5,0.5,3.3,0.7,5.3,0.7c2.8,0,5.1-0.3,7-0.8v-45.4c2.7-0.4,5.3-0.7,7.9-0.7c2.6,0,5.3,0.2,8,0.7v55.8c-2.4,0.8-5.6,1.6-9.5,2.4 c-3.9,0.8-8,1.2-12.3,1.2c-3.8,0-7.5-0.3-11-0.9c-3.5-0.6-6.6-1.9-9.3-3.8c-2.7-1.9-4.8-4.8-6.3-8.5c-1.6-3.7-2.4-8.7-2.4-14.9 V147.1z M257.1,205.1c-0.4-2.8-0.7-5.5-0.7-8.2c0-2.7,0.2-5.5,0.7-8.3c2.8-0.4,5.5-0.7,8.2-0.7c2.7,0,5.5,0.2,8.3,0.7 c0.4,2.8,0.7,5.6,0.7,8.2c0,2.8-0.2,5.5-0.7,8.3c-2.8,0.4-5.6,0.7-8.2,0.7C262.6,205.7,259.9,205.5,257.1,205.1z M256.7,124.4 c2.9-0.4,5.8-0.7,8.6-0.7c2.9,0,5.8,0.2,8.8,0.7l-1.1,54.9c-2.6,0.4-5.1,0.7-7.5,0.7c-2.5,0-5.1-0.2-7.6-0.7L256.7,124.4z" />
        <path d="M175,25C92.2,25,25,92.2,25,175c0,82.8,67.2,150,150,150c82.8,0,150-67.2,150-150 C325,92.2,257.8,25,175,25z M175,310c-74.6,0-135-60.4-135-135c0-74.6,60.4-135,135-135s135,60.4,135,135 C310,249.6,249.6,310,175,310z" />
      </svg>
    );
  if (kind === "download")
    return (
      // Font Awesome Free 5.15.4, solid/download (CC BY 4.0).
      // See LICENSES/Font-Awesome-Free.md.
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
        <ActionIcon kind="download" />
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
