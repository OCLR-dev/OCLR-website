import { Resolver } from "node:dns/promises";
import { type IncomingMessage } from "node:http";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { HttpError } from "./http-error";
import { beatmapDownloadMirrors, safeDownloadMirror } from "./mappool-download";
import { REPLAY_BEATMAP_MAX_BYTES } from "./replay-model";

const defaultHosts = [
  "beatconnect.io",
  "dl.sayobot.cn",
  "tc1.sayobot.cn:25225",
  "catboy.best",
  "github.com",
  "raw.githubusercontent.com",
];
const nonPublic = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  nonPublic.addSubnet(network, prefix);

export function approvedBeatmapMirror(value: string) {
  const valid = safeDownloadMirror(value);
  if (!valid) return null;
  const url = new URL(valid);
  const extra = (process.env.OCLR_BEATMAP_MIRROR_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase());
  if (
    url.hash ||
    !/^[a-z0-9.-]+$/.test(url.hostname) ||
    isIP(url.hostname) ||
    ![...defaultHosts, ...extra].includes(url.host)
  )
    return null;
  return url;
}

export function cacheMirrorOptions(setId: number, saved: string | null) {
  const savedUrl = safeDownloadMirror(saved);
  return beatmapDownloadMirrors(setId, savedUrl).flatMap((mirror) => {
    const url = !mirror.search && approvedBeatmapMirror(mirror.href);
    const id = mirror.href === savedUrl ? ("saved" as const) : mirror.icon;
    return url && id && id !== "github" ? [{ id, name: mirror.name, url }] : [];
  });
}

export function isPublicBeatmapMirrorAddress(address: string) {
  return isIP(address) === 4 && !nonPublic.check(address);
}

async function resolveMirror(url: URL, signal: AbortSignal) {
  signal.throwIfAborted();
  const resolver = new Resolver({ timeout: 2500, tries: 2 });
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const addresses = await resolver.resolve4(url.hostname);
    if (!addresses.length || !addresses.every(isPublicBeatmapMirrorAddress))
      throw new HttpError(
        422,
        "The mirror must resolve to a public IPv4 address.",
      );
    return addresses[0];
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

async function getMirrorResponse(url: URL, signal: AbortSignal) {
  const address = await resolveMirror(url, signal);
  return new Promise<IncomingMessage>((resolve, reject) => {
    // Use precisely the checked IP for the connection, while authenticating
    // the approved name with TLS and sending that name in the Host header.
    const outgoing = request(
      {
        hostname: address,
        port: url.port || 443,
        servername: url.hostname,
        path: url.pathname + url.search,
        headers: { Host: url.host, "Accept-Encoding": "identity" },
        rejectUnauthorized: true,
        agent: false,
        signal,
      },
      (response) => {
        clearTimeout(headerTimer);
        resolve(response);
      },
    );
    const stalled = () =>
      outgoing.destroy(new Error("Mirror request stalled."));
    const headerTimer = setTimeout(stalled, 8_000);
    headerTimer.unref();
    outgoing.setTimeout(8_000, stalled);
    outgoing.on("error", (error) => {
      clearTimeout(headerTimer);
      reject(error);
    });
    outgoing.end();
  });
}

async function downloadFromMirror(url: URL, signal: AbortSignal) {
  try {
    let next = url;
    for (let hop = 0; hop <= 3; hop++) {
      signal.throwIfAborted();
      const target = approvedBeatmapMirror(next.href);
      if (!target)
        throw new HttpError(
          422,
          "The beatmap mirror or redirect is not approved.",
        );
      const response = await getMirrorResponse(target, signal);
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        response.destroy();
        if (!response.headers.location) break;
        next = new URL(response.headers.location, target);
        continue;
      }
      if (response.statusCode === 429) {
        response.destroy();
        throw new HttpError(
          429,
          "The mirror is rate limited. Try another mirror or upload an .osz.",
        );
      }
      const contentType = response.headers["content-type"];
      if (
        response.statusCode !== 200 ||
        (contentType &&
          /^(?:text\/html|application\/json)\b/i.test(contentType)) ||
        (response.headers["content-encoding"] &&
          response.headers["content-encoding"] !== "identity")
      ) {
        response.destroy();
        throw new HttpError(
          502,
          "The mirror did not return a beatmap package.",
        );
      }
      if (
        Number(response.headers["content-length"]) > REPLAY_BEATMAP_MAX_BYTES
      ) {
        response.destroy();
        throw new HttpError(
          413,
          "Choose an .osz beatmap package up to 64 MiB.",
        );
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response) {
        signal.throwIfAborted();
        size += chunk.length;
        if (size > REPLAY_BEATMAP_MAX_BYTES)
          throw new HttpError(
            413,
            "Choose an .osz beatmap package up to 64 MiB.",
          );
        chunks.push(chunk);
      }
      if (!response.complete || !size)
        throw new HttpError(
          502,
          "The mirror did not return a beatmap package.",
        );
      return Buffer.concat(chunks, size);
    }
    throw new HttpError(502, "The beatmap mirror redirected too many times.");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (signal.aborted)
      throw new HttpError(
        504,
        "The beatmap mirror download timed out or was interrupted.",
      );
    throw new HttpError(
      502,
      "The mirror could not be reached. Try another mirror or upload an .osz.",
    );
  }
}

export async function downloadBeatmapMirror(
  url: URL,
  abort: AbortSignal,
  alternatives: readonly URL[] = [],
) {
  const signal = AbortSignal.any([AbortSignal.timeout(60_000), abort]);
  const sources = [url, ...alternatives];
  for (const [index, source] of sources.entries()) {
    try {
      return await downloadFromMirror(source, signal);
    } catch (error) {
      if (
        signal.aborted ||
        index === sources.length - 1 ||
        !(error instanceof HttpError) ||
        (error.status !== 429 && error.status !== 502)
      )
        throw error;
    }
  }
  throw new HttpError(502, "The mirror did not return a beatmap package.");
}
