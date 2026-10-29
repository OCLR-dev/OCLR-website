import http from "node:http";
import { chromium, devices } from "@playwright/test";
import { writeFileSync, readdirSync } from "node:fs";
const base = "http://127.0.0.1:31433";
const raw = (url, options = {}) =>
  new Promise((resolve, reject) =>
    http
      .get(url, { headers: options.headers }, (r) => {
        const parts = [];
        r.on("data", (c) => parts.push(c));
        r.on("end", () =>
          resolve(
            new Response(r.statusCode === 304 ? null : Buffer.concat(parts), {
              status: r.statusCode,
              headers: r.headers,
            }),
          ),
        );
      })
      .on("error", reject),
  );
const stage = process.argv[2];
const assets = [
  "/branding/oclr-mark.svg",
  "/oclr-s11-key-visual.webp",
  "/archive/s7/key-visual.jpg",
  "/themes/prism-overture/prism-field-light.svg",
  "/fonts/quicksand-latin-variable.woff2",
];
const crawl = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? crawl(`${d}/${e.name}`) : [`${d}/${e.name}`],
  );
for (const ext of [".css", ".js"])
  assets.push(
    crawl(".next/static")
      .find((f) => f.endsWith(ext))
      .replace(".next", "/_next"),
  );
const result = {
  stage,
  environment:
    "Next.js 16.4.2 next start; Node 24; direct loopback HTTP; no Nginx; no DB",
  headers: [],
  browsers: [],
};
for (const path of [
  ...assets,
  "/login",
  "/api/v1/me",
  "/api/private.png",
  "/auth/osu",
  "/themes/missing.svg",
]) {
  const r = await raw(base + path, { redirect: "manual" });
  const h = Object.fromEntries(
    [...r.headers].filter(([k]) =>
      [
        "cache-control",
        "etag",
        "last-modified",
        "content-type",
        "content-security-policy",
        "vary",
        "x-content-type-options",
      ].includes(k),
    ),
  );
  const entry = { path, status: r.status, headers: h };
  if (assets.includes(path)) {
    for (const [header, value] of [
      ["If-None-Match", r.headers.get("etag")],
      ["If-Modified-Since", r.headers.get("last-modified")],
    ])
      if (value) {
        const v = await raw(base + path, { headers: { [header]: value } });
        entry[header] = {
          status: v.status,
          bytes: (await v.arrayBuffer()).byteLength,
        };
      }
  }
  result.headers.push(entry);
  await r.arrayBuffer();
}
const browser = await chromium.launch();
for (const mobile of [false, true]) {
  const context = await browser.newContext(
    mobile ? { ...devices["iPhone 13"], defaultBrowserType: undefined } : {},
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const events = [];
  cdp.on("Network.responseReceived", ({ response: r }) => {
    if (assets.some((p) => new URL(r.url).pathname === p))
      events.push({
        path: new URL(r.url).pathname,
        status: r.status,
        fromDiskCache: !!r.fromDiskCache,
      });
  });
  const runs = [];
  for (const phase of ["cold", "revisit", "reload"]) {
    const resp =
      phase === "reload"
        ? await page.reload()
        : await page.goto(base + "/login");
    await page.evaluate(async (paths) => {
      await Promise.all(
        paths.map((path) => fetch(path).then((r) => r.arrayBuffer())),
      );
    }, assets);
    const resources = await page.evaluate(
      (paths) =>
        performance
          .getEntriesByType("resource")
          .filter((e) => paths.includes(new URL(e.name).pathname))
          .map((e) => ({
            path: new URL(e.name).pathname,
            transferSize: e.transferSize,
            encodedBodySize: e.encodedBodySize,
          })),
      assets,
    );
    runs.push({
      phase,
      pageStatus: resp.status(),
      requests: resources.length,
      transferBytes: resources.reduce((n, r) => n + r.transferSize, 0),
      resources,
    });
    if (phase === "cold") await page.goto("about:blank");
  }
  await page.screenshot({
    path: `docs/verification/issue-433/${stage}-${mobile ? "mobile" : "desktop"}.png`,
    fullPage: false,
  });
  result.browsers.push({
    device: mobile ? "iPhone 13 emulation" : "Desktop Chromium",
    runs,
    events,
  });
  await context.close();
}
await browser.close();
writeFileSync(
  `docs/verification/issue-433/${stage}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({
    stage,
    browsers: result.browsers.map((b) => ({
      device: b.device,
      runs: b.runs.map(({ phase, pageStatus, requests, transferBytes }) => ({
        phase,
        pageStatus,
        requests,
        transferBytes,
      })),
    })),
  }),
);
