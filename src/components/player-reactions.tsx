"use client";
import Image from "next/image";
import Link from "next/link";
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
import type { PlayerReactionSummary } from "@/lib/player-reaction-write-contract";

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

function incrementPick(id: string) {
  const picks = parsePlayerReactionPicks(
    localStorage.getItem(picksKey) ?? "{}",
  );
  picks.set(id, Math.min((picks.get(id) ?? 0) + 1, Number.MAX_SAFE_INTEGER));
  localStorage.setItem(picksKey, JSON.stringify(Object.fromEntries(picks)));
}

async function saveLocally(save: () => void) {
  function update() {
    try {
      save();
    } finally {
      window.dispatchEvent(new Event(changeEvent));
    }
  }
  try {
    if (navigator.locks) await navigator.locks.request(picksKey, update);
    else update();
  } catch {}
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
  signedIn,
  reactions,
  onChange,
}: {
  playerId: number;
  edition: string;
  name: string;
  signedIn: boolean;
  reactions: PlayerReactionSummary;
  onChange: (reactions: PlayerReactionSummary) => void;
}) {
  const tr = useAppTranslations();
  const endpoint = `/api/tournaments/${encodeURIComponent(edition)}/players/${playerId}/reactions`;
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ id: string; selected: boolean }>();

  async function setReaction(id: string, selected: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(undefined);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, selected }),
      });
      if (!response.ok) throw new Error();
      onChange(await response.json());
      if (selected) void saveLocally(() => incrementPick(id));
    } catch {
      // A lost response can follow a committed write. Recover the saved count
      // before offering the same idempotent action again.
      try {
        const response = await fetch(endpoint);
        if (response.ok) onChange(await response.json());
      } catch {}
      setFailed({ id, selected });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <ReactionPicker
        name={name}
        reactions={reactions}
        setReaction={signedIn ? setReaction : undefined}
        busy={busy}
      />
      {failed && (
        <div className="player-message-controls small">
          <span role="alert">
            {tr("This request could not be completed. Please try again.")}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => void setReaction(failed.id, failed.selected)}
          >
            {tr("Retry")}
          </button>
        </div>
      )}
    </>
  );
}

export function EmojiReactions({
  storageKey,
  name,
}: {
  storageKey: string;
  name: string;
}) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => storedValue(storageKey, emptySelection()),
    emptySelection,
  );

  function setReaction(id: string, add: boolean) {
    return saveLocally(() => {
      const current = parsePlayerReactions(
        localStorage.getItem(storageKey) ?? "[]",
      );
      if (current.includes(id) === add) return;
      const next = add
        ? [...current, id]
        : current.filter((value) => value !== id);
      localStorage.setItem(storageKey, JSON.stringify(next));
      if (add) incrementPick(id);
    });
  }

  return (
    <ReactionPicker
      name={name}
      reactions={parsePlayerReactions(snapshot).map((id) => ({
        id,
        count: 1,
        selected: true,
      }))}
      setReaction={setReaction}
    />
  );
}

function ReactionPicker({
  name,
  reactions,
  setReaction,
  busy = false,
}: {
  name: string;
  reactions: PlayerReactionSummary;
  setReaction?: (id: string, selected: boolean) => Promise<void>;
  busy?: boolean;
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
  const pickSnapshot = useSyncExternalStore(
    subscribe,
    () =>
      open && frequent ? storedValue(picksKey, emptyPicks()) : emptyPicks(),
    emptyPicks,
  );
  const selected = new Set(
    reactions.filter((row) => row.selected).map((row) => row.id),
  );
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

  return (
    <div
      className="player-reactions"
      role="group"
      aria-label={tr("Reactions for {name}", { name })}
    >
      {reactions.map(({ id, count, selected }) => {
        const reaction = playerReactionById.get(id);
        const label = reaction?.name ?? id;
        const countId = `${pickerId}-count-${id}`;
        const content = (
          <>
            {reaction ? (
              <ReactionImage reaction={reaction} animated />
            ) : (
              <span aria-hidden="true">{id}</span>
            )}
            <span className="reaction-count" id={countId}>
              {count}
            </span>
          </>
        );
        return setReaction ? (
          <button
            type="button"
            key={id}
            className="player-reaction"
            title={label}
            aria-label={tr("React with {emoji}", { emoji: label })}
            aria-pressed={selected}
            aria-describedby={countId}
            aria-disabled={busy || undefined}
            onClick={() => {
              if (busy) return;
              if (selected && count === 1) trigger.current?.focus();
              void setReaction(id, !selected);
            }}
          >
            {content}
          </button>
        ) : (
          <span className="player-reaction" key={id} title={label}>
            <span className="sr-only">{label} </span>
            {content}
          </span>
        );
      })}
      {setReaction ? (
        <button
          ref={trigger}
          type="button"
          className="reaction-add"
          popoverTarget={pickerId}
          aria-label={tr("Add reaction")}
          title={tr("Add reaction")}
          aria-expanded={open}
          aria-disabled={busy || undefined}
          onClick={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          ＋
        </button>
      ) : (
        <Link
          className="reaction-add"
          href="/login"
          prefetch={false}
          aria-label={tr("Sign in with osu!")}
          title={tr("Sign in with osu!")}
        >
          ＋
        </Link>
      )}
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
                    aria-pressed={selected.has(reaction.id)}
                    aria-disabled={busy || undefined}
                    onMouseEnter={() => setHovered(reaction.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setFocused(reaction.id)}
                    onBlur={() => setFocused(null)}
                    onClick={() => {
                      if (busy) return;
                      void setReaction?.(
                        reaction.id,
                        !selected.has(reaction.id),
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
