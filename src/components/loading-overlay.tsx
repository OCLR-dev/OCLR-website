"use client";

import { useAppTranslations } from "@/i18n/shared";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import styles from "./loading-overlay.module.css";
import { Spinner } from "./spinner";

// Overlapping foreground operations share one modal until every owner finishes.
const owners = new Set<string>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const activeOwner = () => owners.values().next().value;
const serverOwner = () => undefined;
function notify() {
  for (const listener of listeners) listener();
}

function BlockingOverlay() {
  const tr = useAppTranslations();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    element.showModal();
    element.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.overlay}
      data-loading-overlay=""
      aria-modal="true"
      aria-busy="true"
      aria-label={tr("Loading…")}
      tabIndex={-1}
      onCancel={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // This status modal has no controls; keep keyboard focus here until it ends.
        if (event.key === "Tab") {
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
        }
        event.stopPropagation();
      }}
    >
      <div role="status" aria-live="polite" aria-label={tr("Loading…")}>
        <Spinner />
      </div>
    </dialog>
  );
}

/** Opt-in foreground loading. Background reads never mount this overlay. */
export function LoadingOverlay() {
  const id = useId();
  const owner = useSyncExternalStore(subscribe, activeOwner, serverOwner);
  useEffect(() => {
    owners.add(id);
    notify();
    return () => {
      owners.delete(id);
      notify();
    };
  }, [id]);
  return owner === id
    ? createPortal(
        <BlockingOverlay />,
        document.querySelector(".site-shell") ?? document.body,
      )
    : null;
}
