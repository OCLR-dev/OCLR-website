"use client";
import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";

/** Retain the request key after an uncertain response so retrying cannot duplicate a write. */
export function useWorkspaceSave(url: string) {
  const tr = useAppTranslations();
  const receipt = useRef<{ payload: string; key: string } | null>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(input: Record<string, unknown>) {
    if (running.current) return;
    const payload = JSON.stringify(input);
    if (receipt.current?.payload !== payload)
      receipt.current = { payload, key: crypto.randomUUID() };
    running.current = true;
    setBusy(true);
    setMessage("");
    setFailed(false);
    let failure = tr(
      "Could not confirm the save. Retry to safely confirm your change.",
    );
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, requestKey: receipt.current.key }),
      });
      const result = await response.json();
      if (!response.ok) {
        failure = tr(result.error);
        throw new Error();
      }
      if (!Number.isSafeInteger(result.version)) throw new Error();
      receipt.current = null;
      setMessage(tr("Saved"));
      return result.version as number;
    } catch {
      setFailed(true);
      setMessage(failure);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { save, busy, message, failed };
}

export function useUnsavedWorkspace(dirty: boolean) {
  const tr = useAppTranslations();
  const prompt = tr("Discard your unsaved changes?");
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.download ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const url = new URL(link.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.pathname === location.pathname && url.search === location.search)
        return;
      if (!window.confirm(prompt)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, prompt]);
}
