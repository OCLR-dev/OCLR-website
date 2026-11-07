"use client";
import Image from "next/image";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  parsePlayerReactionPicks,
  parsePlayerReactions,
  playerReactionById,
  searchPlayerReactions,
  type PlayerReaction,
} from "@/lib/player-reactions";

const changeEvent = "oclr-player-reactions";
const picksKey = "oclr-reaction-picks";
const batchSize = 40;

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}
const emptySelection = () => "[]";
const emptyPicks = () => "{}";

function storedValue(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function ReactionImage({
  reaction,
  animated = false,
}: {
  reaction: PlayerReaction;
  animated?: boolean;
}) {
  return (
    <picture
      className={`reaction-image${reaction.group === "osu" && reaction.src.endsWith(".svg") ? " reaction-image-mod" : ""}`}
    >
      {animated && reaction.animatedSrc && (
        <source
          media="(prefers-reduced-motion: no-preference)"
          srcSet={reaction.animatedSrc}
        />
      )}
      <Image src={reaction.src} width={32} height={32} alt="" unoptimized />
    </picture>
  );
}

export function PlayerReactions({
  playerId,
  edition,
  name,
}: {
  playerId: number;
  edition: string;
  name: string;
}) {
  const tr = useAppTranslations();
  const pickerId = useId();
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [frequent, setFrequent] = useState(false);
  const [limit, setLimit] = useState(batchSize);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const key = `oclr-reactions:${edition}:${playerId}`;
  const snapshot = useSyncExternalStore(
    subscribe,
    () => storedValue(key, emptySelection()),
    emptySelection,
  );
  const pickSnapshot = useSyncExternalStore(
    subscribe,
    () =>
      open && frequent ? storedValue(picksKey, emptyPicks()) : emptyPicks(),
    emptyPicks,
  );
  const selected = parsePlayerReactions(snapshot);
  const picks = useMemo(
    () => parsePlayerReactionPicks(pickSnapshot),
    [pickSnapshot],
  );
  const candidates = useMemo(
    () =>
      open ? searchPlayerReactions(query, frequent ? picks : undefined) : [],
    [open, query, frequent, picks],
  );
  const visible = candidates.slice(0, limit);

  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      if (!picker.current || !trigger.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const panel = picker.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const bottom = offsetTop + height;
      picker.current.style.left = `${Math.max(offsetLeft + 12, Math.min(rect.left, offsetLeft + width - panel.width - 12))}px`;
      const top =
        rect.bottom + panel.height + 8 <= bottom - 12
          ? rect.bottom + 8
          : rect.top - panel.height - 8;
      picker.current.style.top = `${Math.max(offsetTop + 12, Math.min(top, bottom - panel.height - 12))}px`;
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [open]);

  function resetResults() {
    setLimit(batchSize);
    setHovered(null);
    setFocused(null);
    scroll.current?.scrollTo(0, 0);
  }

  async function setReaction(id: string, add: boolean) {
    function save() {
      const current = parsePlayerReactions(localStorage.getItem(key) ?? "[]");
      if (current.includes(id) === add) return;
      const next = add
        ? [...current, id]
        : current.filter((value) => value !== id);
      localStorage.setItem(key, JSON.stringify(next));
      try {
        if (add) {
          const picks = parsePlayerReactionPicks(
            localStorage.getItem(picksKey) ?? "{}",
          );
          picks.set(
            id,
            Math.min((picks.get(id) ?? 0) + 1, Number.MAX_SAFE_INTEGER),
          );
          localStorage.setItem(
            picksKey,
            JSON.stringify(Object.fromEntries(picks)),
          );
        }
      } finally {
        window.dispatchEvent(new Event(changeEvent));
      }
    }

    // Serialize updates across same-origin tabs when Web Locks is available.
    try {
      if (navigator.locks) await navigator.locks.request(picksKey, save);
      else save();
    } catch {}
  }

  return (
    <div
      className="player-reactions"
      role="group"
      aria-label={tr("Reactions for {name}", { name })}
    >
      {selected.map((id) => {
        const reaction = playerReactionById.get(id);
        const label = reaction?.name ?? id;
        return (
          <button
            type="button"
            key={id}
            className="player-reaction"
            title={label}
            aria-label={tr("React with {emoji}", { emoji: label })}
            aria-pressed="true"
            onClick={() => void setReaction(id, false)}
          >
            {reaction ? (
              <ReactionImage reaction={reaction} animated />
            ) : (
              <span aria-hidden="true">{id}</span>
            )}
            <span className="reaction-count">1</span>
          </button>
        );
      })}
      <button
        ref={trigger}
        type="button"
        className="reaction-add"
        popoverTarget={pickerId}
        aria-label={tr("Add reaction")}
        title={tr("Add reaction")}
        aria-expanded={open}
      >
        ＋
      </button>
      <div
        ref={picker}
        id={pickerId}
        popover="auto"
        className="reaction-picker"
        aria-label={tr("Choose an emoji")}
        onKeyDown={(event) => {
          // A search input otherwise consumes Escape to clear its value first.
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            picker.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setOpen(isOpen);
          if (!isOpen) {
            setQuery("");
            setFrequent(false);
            resetResults();
          }
        }}
      >
        {open && (
          <>
            <div className="reaction-picker-toolbar">
              <input
                type="search"
                value={query}
                aria-label={tr("Search emoji")}
                placeholder={tr("Search emoji")}
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetResults();
                }}
              />
            </div>
            <div className="reaction-picker-toolbar reaction-picker-filter">
              <button
                type="button"
                aria-pressed={frequent}
                onClick={() => {
                  setFrequent(!frequent);
                  resetResults();
                }}
              >
                {tr("Frequently used")}
              </button>
              <span className="reaction-picker-total">
                {visible.length}/{candidates.length}
              </span>
            </div>
            <div
              ref={scroll}
              className="reaction-picker-scroll"
              onScroll={(event) => {
                const { scrollHeight, scrollTop, clientHeight } =
                  event.currentTarget;
                if (
                  visible.length < candidates.length &&
                  scrollTop > 0 &&
                  scrollHeight - scrollTop - clientHeight <= 24
                ) {
                  setLimit(limit + batchSize);
                }
              }}
            >
              <div
                className="reaction-picker-grid"
                role="group"
                aria-label={tr("Choose an emoji")}
              >
                {visible.map((reaction) => (
                  <button
                    type="button"
                    key={reaction.id}
                    title={`${reaction.name} · ${reaction.id}`}
                    data-reaction-id={reaction.id}
                    aria-label={tr("React with {emoji}", {
                      emoji: reaction.name,
                    })}
                    aria-pressed={selected.includes(reaction.id)}
                    onMouseEnter={() => setHovered(reaction.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setFocused(reaction.id)}
                    onBlur={() => setFocused(null)}
                    onClick={() => {
                      void setReaction(
                        reaction.id,
                        !selected.includes(reaction.id),
                      );
                      picker.current?.hidePopover();
                      trigger.current?.focus();
                    }}
                  >
                    <ReactionImage
                      reaction={reaction}
                      animated={
                        hovered === reaction.id || focused === reaction.id
                      }
                    />
                  </button>
                ))}
              </div>
              {!candidates.length && (
                <p className="muted small" role="status">
                  {frequent && !picks.size
                    ? tr("No frequently used emoji yet.")
                    : tr("No matching emoji.")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
