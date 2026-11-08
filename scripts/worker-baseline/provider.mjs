// Loopback HTTP fixture. This process never opens a database or proxies a URL.
import { createServer } from "node:http";

if (!process.send) throw new Error("Start the provider through the benchmark.");
process.once("disconnect", () => process.exit(0));

const beatmaps = new Set([
  67895, 136033, 9900001, 9900002, 9900003, 9900004, 9900005,
]);
let retryServed = false;
const server = createServer((request, response) => {
  request.resume();
  let delay = 20;
  let status = 200;
  let body;
  if (request.method === "POST" && request.url === "/oauth/token") {
    body = {
      access_token: "synthetic-perf-token",
      expires_in: 3600,
      token_type: "Bearer",
    };
  } else {
    const id = Number(
      /^\/api\/v2\/beatmaps\/(\d+)$/.exec(request.url ?? "")?.[1],
    );
    if (
      request.method !== "GET" ||
      !beatmaps.has(id) ||
      request.headers.authorization !== "Bearer synthetic-perf-token"
    ) {
      response.writeHead(404).end();
      return;
    }
    if (id === 9900002) delay = 250;
    if (id === 9900003 && !retryServed) {
      retryServed = true;
      status = 503;
    }
    if (id === 9900004) status = 429;
    if (id === 9900005) delay = 11_000;
    body = {
      id,
      beatmapset_id: 42,
      version: "Synthetic",
      difficulty_rating: 5,
      bpm: 180,
      total_length: 120,
      mode: "osu",
      checksum: "a".repeat(32),
      beatmapset: {
        title: "Synthetic",
        artist: "Synthetic",
        creator: "Synthetic",
      },
    };
  }
  const timer = setTimeout(() => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  }, delay);
  response.once("close", () => clearTimeout(timer));
});

server.listen(0, "127.0.0.1", () => {
  process.send(server.address().port);
});
