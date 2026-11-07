import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import next from "next";
import pg from "pg";

if (!process.send) throw new Error("Start this worker through the benchmark.");
process.once("disconnect", () => process.exit(0));
const origin = new URL(process.env.APP_URL);
const profile = process.argv[2] === "profile";
const context = new AsyncLocalStorage();
const samples = [];
const loop = monitorEventLoopDelay({ resolution: 10 });

function timeMethod(prototype, method, metric) {
  const original = prototype[method];
  prototype[method] = function (...args) {
    const sample = context.getStore();
    if (!sample) return original.apply(this, args);
    const started = performance.now();
    const record = () => {
      sample[metric].count++;
      sample[metric].ms += performance.now() - started;
    };
    const last = args.length - 1;
    const callback = args[last];
    if (typeof callback === "function") {
      args[last] = function (...values) {
        record();
        return callback.apply(this, values);
      };
      return original.apply(this, args);
    }
    return original.apply(this, args).finally(record);
  };
}

if (profile) {
  // Instrument the driver only in this worker. Pool.query uses Pool.connect
  // and Client.query, so transactions and standalone statements are both counted.
  timeMethod(pg.Pool.prototype, "connect", "pool");
  timeMethod(pg.Client.prototype, "query", "sql");
}

const originalFetch = globalThis.fetch;
let blockedFetches = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin === origin.origin)
    return originalFetch(input, { ...init, redirect: "error" });
  blockedFetches++;
  const sample = context.getStore();
  if (sample) sample.blockedFetches++;
  throw new Error("Outbound fetch is disabled in the API benchmark.");
};

const app = next({
  dev: false,
  hostname: origin.hostname,
  port: Number(origin.port),
});
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((request, response) => {
  const id = request.headers["x-oclr-benchmark-id"];
  if (!profile || typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) {
    void handle(request, response).catch(() => response.destroy());
    return;
  }
  const started = performance.now();
  const sample = {
    id,
    sql: { count: 0, ms: 0 },
    pool: { count: 0, ms: 0 },
    blockedFetches: 0,
    status: 0,
    handlerMs: 0,
  };
  const finish = () => {
    sample.status = response.writableFinished ? response.statusCode : 0;
    sample.handlerMs = performance.now() - started;
    if (samples.length < 1024) samples.push(sample);
  };
  response.once("close", finish);
  context.run(sample, () => {
    void handle(request, response).catch(() => response.destroy());
  });
});

let cpuStart = process.cpuUsage();
let phaseStart = performance.now();
process.on("message", (command) => {
  if (command === "start") {
    samples.length = 0;
    blockedFetches = 0;
    loop.reset();
    loop.enable();
    cpuStart = process.cpuUsage();
    phaseStart = performance.now();
    process.send("started");
  } else if (command === "report") {
    loop.disable();
    const cpu = process.cpuUsage(cpuStart);
    const { rss, heapUsed } = process.memoryUsage();
    process.send({
      samples,
      wallMs: performance.now() - phaseStart,
      cpuMs: (cpu.user + cpu.system) / 1000,
      rssBytes: rss,
      heapUsedBytes: heapUsed,
      eventLoopSamples: loop.count,
      eventLoopP95Ms: loop.count ? loop.percentile(95) / 1e6 : null,
      blockedFetches,
    });
  }
});
server.listen(Number(origin.port), "127.0.0.1", () => process.send("ready"));
