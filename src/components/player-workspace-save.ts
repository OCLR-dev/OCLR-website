"use client";
import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type {
  availabilityWrite,
  practiceWrite,
  WorkspaceWriteInput,
} from "@/lib/player-workspace-contracts";

/** Retain the request key after an uncertain response so retrying cannot duplicate a write. */
export function useWorkspaceSave<
  Operation extends typeof practiceWrite | typeof availabilityWrite,
>(operation: Operation, edition: string) {
  const tr = useAppTranslations();
  const receipt = useRef<{ payload: string; key: string } | null>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(
    input: WorkspaceWriteInput<Operation>,
    successMessage = tr("Saved"),
  ) {
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
      const response = await fetch(
        operation.path.replace("{edition}", edition),
        {
          method: operation.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, requestKey: receipt.current.key }),
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        const error = operation.error.safeParse(result);
        if (error.success) failure = tr(error.data.error);
        throw new Error();
      }
      const parsed = operation.response.parse(result);
      receipt.current = null;
      setMessage(successMessage);
      return parsed.version;
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
