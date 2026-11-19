"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BwsCardNoteTrigger } from "./profile-info";

export function BwsRankNote({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const button = trigger.current;
    const note = panel.current;
    if (!open || !button || !note) return;
    const header = document.querySelector("header.site-header");
    const viewport = window.visualViewport;

    const update = () => {
      const inset = 12;
      const gap = 8;
      const left = (viewport?.offsetLeft ?? 0) + inset;
      const viewportTop = viewport?.offsetTop ?? 0;
      const top =
        Math.max(viewportTop, header?.getBoundingClientRect().bottom ?? 0) +
        inset;
      const right =
        left +
        (viewport?.width ?? document.documentElement.clientWidth) -
        2 * inset;
      const bottom =
        viewportTop + (viewport?.height ?? window.innerHeight) - inset;
      const anchor = button.getBoundingClientRect();

      note.style.setProperty(
        "--rank-note-width",
        `${Math.max(0, right - left)}px`,
      );
      const width = note.offsetWidth;
      const height = note.scrollHeight + note.offsetHeight - note.clientHeight;
      const above = Math.min(bottom, Math.max(top, anchor.top - gap));
      const below = Math.max(top, Math.min(bottom, anchor.bottom + gap));
      const roomAbove = above - top;
      const roomBelow = bottom - below;
      const openAbove = roomAbove >= height || roomAbove > roomBelow;
      const room = openAbove ? roomAbove : roomBelow;

      note.style.setProperty("--rank-note-height", `${Math.max(0, room)}px`);
      note.style.left = `${Math.max(left, Math.min(anchor.left + (anchor.width - width) / 2, right - width))}px`;
      note.style.top = `${openAbove ? above - note.offsetHeight : below}px`;
      note.dataset.positioned = "";
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      delete note.dataset.positioned;
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, [open]);

  return (
    <div className="bws-card-note">
      <BwsCardNoteTrigger
        ref={trigger}
        popoverTarget={id}
        onOpenLabel={label}
      />
      <div
        ref={panel}
        id={id}
        className="bws-rank-note-panel"
        role="note"
        popover="auto"
        onToggle={(event) =>
          setOpen(event.currentTarget.matches(":popover-open"))
        }
      >
        {children}
      </div>
    </div>
  );
}
