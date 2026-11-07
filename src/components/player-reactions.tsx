"use client";
import Image from "next/image";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  parsePlayerReactions,
  playerReactionById,
  playerReactions,
  searchPlayerReactions,
  type PlayerReaction,
} from "@/lib/player-reactions";

const changeEvent = "oclr-player-reactions";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}
const serverSnapshot = () => "[]";

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const key = `oclr-reactions:${edition}:${playerId}`;
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) ?? "[]";
      } catch {
        return "[]";
      }
    },
    serverSnapshot,
  );
  const selected = parsePlayerReactions(snapshot);
  const candidates = searchPlayerReactions(query);

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

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event(changeEvent));
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
            onClick={() => toggle(id)}
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
            setHovered(null);
            setFocused(null);
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
                  setHovered(null);
                  setFocused(null);
                  picker.current
                    ?.querySelector(".reaction-picker-scroll")
                    ?.scrollTo(0, 0);
                }}
              />
              <span className="reaction-picker-total">
                {candidates.length}/{playerReactions.length}
              </span>
            </div>
            <div className="reaction-picker-scroll">
              <div
                className="reaction-picker-grid"
                role="group"
                aria-label={tr("Choose an emoji")}
              >
                {candidates.map((reaction) => (
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
                      toggle(reaction.id);
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
                  {tr("No matching emoji.")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
