import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import pg from "pg";

type Counter = { count: number; ms: number };
type FetchTiming = {
  operation: "token" | "beatmap";
  status: number | null;
  startMs: number;
  toHeadersMs: number;
};

function timeMethod(
  target: object,
  method: string,
  current: () => Counter | undefined,
) {
  const original = Reflect.get(target, method) as (
    ...args: unknown[]
  ) => unknown;
  Reflect.set(target, method, function (this: unknown, ...args: unknown[]) {
    const counter = current();
    if (!counter) return original.apply(this, args);
    const started = performance.now();
    counter.count++;
    const finish = () => {
      counter.ms += performance.now() - started;
    };
    const last = args.length - 1;
    const callback = args[last];
    if (typeof callback === "function") {
      args[last] = function (this: unknown, ...values: unknown[]) {
        finish();
        return callback.apply(this, values);
      };
      return original.apply(this, args);
    }
    const result = original.apply(this, args);
    return result instanceof Promise ? result.finally(finish) : result;
  });
  return () => Reflect.set(target, method, original);
}

/** These probes exist only in the benchmark process. Store no request or SQL data. */
export function installWorkerMeasurements(providerPort?: number) {
  let phase:
    | {
        started: number;
        sql: Counter;
        pool: Counter;
        provider: FetchTiming[];
      }
    | undefined;
  let blockedFetches = 0;
  const restoreSql = timeMethod(pg.Client.prototype, "query", () => phase?.sql);
  const restorePool = timeMethod(
    pg.Pool.prototype,
    "connect",
    () => phase?.pool,
  );
  const fetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    const operation =
      url.pathname === "/oauth/token" && method === "POST"
        ? "token"
        : /^\/api\/v2\/beatmaps\/(?:67895|136033|990000[1-5])$/.test(
              url.pathname,
            ) && method === "GET"
          ? "beatmap"
          : null;
    if (
      !providerPort ||
      url.origin !== "https://osu.ppy.sh" ||
      url.search ||
      !operation
    ) {
      blockedFetches++;
      throw new Error("Nonfixture fetch blocked.");
    }
    const sample = phase;
    const started = performance.now();
    let status: number | null = null;
    try {
      const response = await fetch(
        `http://127.0.0.1:${providerPort}${url.pathname}`,
        { ...init, redirect: "error" },
      );
      status = response.status;
      return response;
    } finally {
      sample?.provider.push({
        operation,
        status,
        startMs: started - sample.started,
        toHeadersMs: performance.now() - started,
      });
    }
  };

  return {
    async measure<T>(name: string, run: () => Promise<T>) {
      const loop = monitorEventLoopDelay({ resolution: 10 });
      loop.enable();
      const cpu = process.cpuUsage();
      const active = {
        started: performance.now(),
        sql: { count: 0, ms: 0 },
        pool: { count: 0, ms: 0 },
        provider: [] as FetchTiming[],
      };
      phase = active;
      try {
        const result = await run();
        const wallMs = performance.now() - active.started;
        const { user, system } = process.cpuUsage(cpu);
        const { rss, heapUsed } = process.memoryUsage();
        return {
          name,
          result,
          wallMs,
          cpuMs: (user + system) / 1000,
          rssBytes: rss,
          heapUsedBytes: heapUsed,
          eventLoopSamples: loop.count,
          eventLoopP95Ms: loop.count ? loop.percentile(95) / 1e6 : null,
          sql: active.sql,
          pool: active.pool,
          provider: active.provider.toSorted((a, b) => a.startMs - b.startMs),
        };
      } finally {
        loop.disable();
        phase = undefined;
      }
    },
    blockedFetches: () => blockedFetches,
    restore() {
      globalThis.fetch = fetch;
      restorePool();
      restoreSql();
    },
  };
}
