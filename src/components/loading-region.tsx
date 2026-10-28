"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useAppTranslations } from "@/i18n/shared";
import { Spinner } from "./spinner";
import styles from "./loading-region.module.css";

const owners = new Map<HTMLElement, Set<string>>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify() {
  for (const listener of listeners) listener();
}
const serverOwner = () => undefined;

function RegionMask() {
  const tr = useAppTranslations();
  const mask = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const overlay = mask.current!;
    const target = overlay.parentElement!;
    const previousPosition = target.style.position;
    const focused = document.activeElement;
    const inheritedInert = new Map<HTMLElement, boolean>();
    if (getComputedStyle(target).position === "static")
      target.style.position = "relative";
    function blockContent() {
      for (const child of target.children) {
        if (
          !(child instanceof HTMLElement) ||
          child.hasAttribute("data-loading-region-overlay") ||
          child.hasAttribute("data-loading-region-anchor")
        )
          continue;
        if (!inheritedInert.has(child)) inheritedInert.set(child, child.inert);
        child.inert = true;
      }
    }
    function center() {
      const point = indicator.current;
      if (!point || !target.isConnected) return;
      const box = target.getBoundingClientRect();
      // Exclude our own absolute box when measuring a scrollable dialog.
      overlay.style.height = "0px";
      overlay.style.height = `${Math.max(target.scrollHeight, target.clientHeight)}px`;
      const left = Math.max(0, box.left),
        right = Math.min(innerWidth, box.right);
      const top = Math.max(0, box.top),
        bottom = Math.min(innerHeight, box.bottom);
      point.style.left = `${(right > left ? (left + right) / 2 - box.left : box.width / 2) + target.scrollLeft}px`;
      point.style.top = `${(bottom > top ? (top + bottom) / 2 - box.top : box.height / 2) + target.scrollTop}px`;
    }
    blockContent();
    center();
    if (focused instanceof HTMLElement && target.contains(focused))
      overlay.focus({ preventScroll: true });
    const changes = new MutationObserver(blockContent);
    changes.observe(target, { childList: true });
    const resize = new ResizeObserver(center);
    resize.observe(target);
    window.addEventListener("resize", center);
    document.addEventListener("scroll", center, true);
    return () => {
      changes.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", center);
      document.removeEventListener("scroll", center, true);
      target.style.position = previousPosition;
      for (const [child, inert] of inheritedInert) child.inert = inert;
      // Wait until the commit re-enables the action controls before restoring focus.
      queueMicrotask(() => {
        if (
          focused instanceof HTMLElement &&
          focused.isConnected &&
          (document.activeElement === overlay ||
            document.activeElement === document.body)
        )
          focused.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <div
      ref={mask}
      className={styles.mask}
      data-loading-region-overlay=""
      role="status"
      aria-busy="true"
      aria-label={tr("Loading…")}
      tabIndex={-1}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div ref={indicator} className={styles.indicator}>
        <Spinner />
      </div>
    </div>
  );
}

/** Place inside the component/dialog to block. No wrapper changes its layout. */
export function LoadingRegion({ scope }: { scope?: string }) {
  const id = useId();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const attach = useCallback(
    (node: HTMLSpanElement | null) => {
      const parent = node?.parentElement;
      setTarget(
        (scope ? parent?.closest<HTMLElement>(scope) : parent) ??
          parent ??
          null,
      );
    },
    [scope],
  );
  const getOwner = useCallback(
    () => (target ? owners.get(target)?.values().next().value : undefined),
    [target],
  );
  const owner = useSyncExternalStore(subscribe, getOwner, serverOwner);
  useEffect(() => {
    if (!target) return;
    const group = owners.get(target) ?? new Set<string>();
    group.add(id);
    owners.set(target, group);
    notify();
    return () => {
      group.delete(id);
      if (!group.size) owners.delete(target);
      notify();
    };
  }, [id, target]);
  return (
    <>
      <span hidden ref={attach} data-loading-region-anchor="" />
      {target && owner === id && createPortal(<RegionMask />, target)}
    </>
  );
}
