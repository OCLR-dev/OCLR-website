import { remoteRetrySeconds } from "./remote-retry";
type HealthState = {
  code?: string;
  identity?: { access: { scopes: string[] } } | null;
};
/** One check at a time; focus/pageshow cannot bypass an active backoff. */
export function remoteHealthMonitor(options: {
  privatePage: boolean;
  initialFailure?: boolean;
  read: (signal: AbortSignal) => Promise<Response>;
  failed: (code: string) => void;
  recovered: () => void;
}) {
  let busy = false,
    disposed = false,
    terminal = false;
  let nextCheck = 0,
    failures = 0,
    unhealthy = Boolean(options.initialFailure);
  let controller: AbortController | undefined;
  return {
    delay() {
      return terminal
        ? null
        : busy
          ? 15000
          : Math.max(0, nextCheck - Date.now());
    },
    dispose() {
      disposed = true;
      controller?.abort();
    },
    async check() {
      if (disposed || terminal || busy || Date.now() < nextCheck) return;
      busy = true;
      controller = new AbortController();
      let delay = 15_000;
      try {
        const response = await options.read(
          AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        );
        const state = (await response.json()) as HealthState;
        if (disposed) return;
        const allowed =
          !options.privatePage ||
          state.identity?.access.scopes.includes("tournaments:private:read");
        if (!response.ok || !allowed) {
          unhealthy = true;
          failures++;
          terminal =
            [401, 403].includes(response.status) || (response.ok && !allowed);
          delay =
            response.status === 429
              ? remoteRetrySeconds(response.headers.get("retry-after")) * 1000
              : Math.min(60_000, 15_000 * 2 ** Math.min(failures - 1, 2));
          options.failed(
            response.ok
              ? "REMOTE_FORBIDDEN"
              : (state.code ?? "REMOTE_UNAVAILABLE"),
          );
        } else {
          failures = 0;
          if (unhealthy) {
            unhealthy = false;
            options.recovered();
          }
        }
      } catch {
        if (!disposed) {
          unhealthy = true;
          failures++;
          delay = Math.min(60_000, 15_000 * 2 ** Math.min(failures - 1, 2));
          options.failed("REMOTE_UNAVAILABLE");
        }
      } finally {
        busy = false;
        nextCheck = Date.now() + delay;
      }
    },
  };
}
