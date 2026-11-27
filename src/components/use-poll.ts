"use client";
import { useContext, useEffect, useEffectEvent, useState } from "react";
import { RemoteReadOnlyContext } from "./staff-read-only";

type Update<T> =
  | { type: "snapshot"; value: T | null }
  | { type: "offline" }
  | { type: "access-lost" };

type StreamMessage<T> = { snapshot?: T | null; status?: number };
const streamType = "application/x-ndjson";
const authLost = (status: number) => [401, 403].includes(status);

export function useSnapshotUpdates<T>(
  endpoint: string | null,
  onUpdate: (update: Update<T>) => void,
  options?: {
    credentials?: RequestCredentials;
    pollMs?: number;
    clearOnNotFound?: boolean;
    refreshBroadcastProfile?: boolean;
  },
) {
  const notify = useEffectEvent(onUpdate);
  const remote = useContext(RemoteReadOnlyContext);
  const {
    credentials,
    pollMs = 2000,
    clearOnNotFound,
    refreshBroadcastProfile,
  } = options ?? {};
  useEffect(() => {
    if (!endpoint) return;
    const accessLost = (status: number) =>
      authLost(status) || (clearOnNotFound && status === 404);
    const snapshotUrl = endpoint;
    let connection = new AbortController();
    const streamUrl = new URL(endpoint, window.location.origin);
    streamUrl.searchParams.set("live", "1");
    let timer: ReturnType<typeof setTimeout>;
    let nextStreamAttempt = 0;
    let stopped = false;

    function receive(signal: AbortSignal, update: Update<T>) {
      if (signal.aborted) return;
      if (update.type === "access-lost") stopped = true;
      notify(update);
    }
    async function readSnapshot(signal: AbortSignal) {
      const response = await fetch(snapshotUrl, {
        cache: "no-store",
        credentials,
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (accessLost(response.status))
        return receive(signal, { type: "access-lost" });
      if (!response.ok) throw new Error("snapshot");
      receive(signal, { type: "snapshot", value: await response.json() });
    }
    async function stream(signal: AbortSignal) {
      const watchdog = new AbortController();
      let deadline = setTimeout(() => watchdog.abort(), Math.min(pollMs, 8000));
      try {
        const response = await fetch(streamUrl, {
          cache: "no-store",
          credentials,
          headers: { Accept: streamType },
          signal: AbortSignal.any([signal, watchdog.signal]),
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith(streamType) ||
          !response.body
        )
          return;
        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        try {
          let buffer = "";
          while (!stopped && !signal.aborted) {
            const { done, value } = await reader.read();
            if (done) return;
            buffer += value;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const message: StreamMessage<T> = JSON.parse(line);
              clearTimeout(deadline);
              deadline = setTimeout(() => watchdog.abort(), 18000);
              if (message.status && accessLost(message.status)) {
                receive(signal, { type: "access-lost" });
                return;
              }
              if ("snapshot" in message) {
                if (refreshBroadcastProfile) await readSnapshot(signal);
                else
                  receive(signal, {
                    type: "snapshot",
                    value: message.snapshot ?? null,
                  });
              }
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
      } finally {
        clearTimeout(deadline);
        watchdog.abort();
      }
    }
    async function update(signal: AbortSignal) {
      try {
        await readSnapshot(signal);
        if (
          !remote &&
          !stopped &&
          !signal.aborted &&
          Date.now() >= nextStreamAttempt
        ) {
          try {
            await stream(signal);
          } catch {
            // A closed, unsupported or buffered stream falls back to snapshots.
          } finally {
            if (!signal.aborted) nextStreamAttempt = Date.now() + 30000;
          }
        }
      } catch {
        receive(signal, { type: "offline" });
      } finally {
        if (!signal.aborted && !stopped)
          timer = setTimeout(() => void update(signal), pollMs);
      }
    }
    // An established stream can outlive a browser network change. Discard its
    // in-flight updates and recheck the authoritative snapshot on reconnect.
    function goOffline() {
      connection.abort();
      clearTimeout(timer);
      if (!stopped) notify({ type: "offline" });
    }
    function goOnline() {
      if (stopped || !connection.signal.aborted) return;
      connection = new AbortController();
      nextStreamAttempt = 0;
      void update(connection.signal);
    }
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (navigator.onLine) void update(connection.signal);
    else goOffline();
    return () => {
      connection.abort();
      clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [
    endpoint,
    credentials,
    pollMs,
    clearOnNotFound,
    refreshBroadcastProfile,
    remote,
  ]);
}

export function usePoll<T>(
  endpoint: string,
  initial: T | null,
  options?: {
    accept?: (current: T | null, next: T | null) => boolean;
    equal?: (current: T | null, next: T | null) => boolean;
    credentials?: RequestCredentials;
    initiallyConnected?: boolean;
    refreshBroadcastProfile?: boolean;
  },
) {
  const [value, setValue] = useState<T | null>(initial);
  const [connected, setConnected] = useState(
    options?.initiallyConnected ?? true,
  );
  const [authorizationLost, setAuthorizationLost] = useState(false);
  const [received, setReceived] = useState(false);
  useSnapshotUpdates<T>(
    endpoint,
    (update) => {
      if (update.type === "snapshot") {
        const next = update.value;
        setAuthorizationLost(false);
        setReceived(true);
        setValue((current) =>
          (options?.accept && !options.accept(current, next)) ||
          options?.equal?.(current, next)
            ? current
            : next,
        );
        setConnected(true);
      } else {
        setConnected(false);
        if (update.type === "access-lost") {
          setValue(null);
          setAuthorizationLost(true);
        }
      }
    },
    options,
  );
  return { value, connected, authorizationLost, received };
}
