"use client";
import { useEffect, useState } from "react";
// One request at a time, complete snapshot replacement, no optimistic events.
export function usePoll<T>(
  endpoint: string,
  initial: T | null,
  options?: {
    accept?: (current: T | null, next: T | null) => boolean;
    credentials?: RequestCredentials;
    initiallyConnected?: boolean;
  },
) {
  const { accept, credentials } = options ?? {};
  const [value, setValue] = useState<T | null>(initial);
  const [connected, setConnected] = useState(
    options?.initiallyConnected ?? true,
  );
  const [authorizationLost, setAuthorizationLost] = useState(false);
  const [received, setReceived] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    let stopped = false;
    async function update() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          credentials,
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        });
        if ([401, 403].includes(response.status)) {
          stopped = true;
          if (active) {
            setValue(null);
            setAuthorizationLost(true);
            setConnected(false);
          }
          return;
        }
        if (!response.ok) throw new Error("snapshot");
        const next: T | null = await response.json();
        if (active) {
          setAuthorizationLost(false);
          setReceived(true);
          setValue((current) =>
            accept && !accept(current, next) ? current : next,
          );
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      } finally {
        if (active && !stopped) timer = setTimeout(update, 2000);
      }
    }
    void update();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, accept, credentials]);
  return { value, connected, authorizationLost, received };
}
