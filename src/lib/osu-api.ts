import { z } from "zod";
import { remoteMode } from "./data-source";
import { HttpError } from "./http";
import { inReadChannel } from "./read-channel";
// Server-only callers use fixed API paths. Tokens never leave this module.
let token: { value: string; expiresAt: number; key: string } | undefined;
let requestingToken: Promise<string> | undefined;
let nextRequestAt = 0;
async function providerFetch(url: string, init?: RequestInit) {
  if (remoteMode() || inReadChannel())
    throw new HttpError(
      403,
      "Provider requests are unavailable in the read-only channel.",
    );
  const now = Date.now();
  const delay = Math.max(0, nextRequestAt - now);
  if (delay > 5000)
    throw new HttpError(429, "osu! lookup is busy. Please retry shortly.");
  nextRequestAt = now + delay + 1100;
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  try {
    return await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    throw new HttpError(
      502,
      "osu! is temporarily unreachable. Saved data has not changed.",
    );
  }
}
async function clientToken() {
  const clientId = process.env.OSU_CLIENT_ID;
  const secret = process.env.OSU_CLIENT_SECRET;
  if (!clientId || !/^[1-9]\d*$/.test(clientId) || !secret)
    throw new HttpError(
      503,
      "Official osu! metadata requires server-side API credentials.",
    );
  const key = `${clientId}:${secret}`;
  if (token && token.key === key && token.expiresAt > Date.now() + 30000)
    return token.value;
  if (!requestingToken)
    requestingToken = (async () => {
      const response = await providerFetch("https://osu.ppy.sh/oauth/token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          grant_type: "client_credentials",
          scope: "public",
        }),
      });
      if (!response.ok)
        throw new HttpError(
          response.status === 429 ? 429 : 502,
          "osu! API authentication is unavailable. Try again later.",
        );
      const parsed = z
        .object({
          access_token: z.string().min(1),
          expires_in: z.number().positive(),
          token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
        })
        .safeParse(await response.json());
      if (!parsed.success)
        throw new HttpError(
          502,
          "osu! returned an invalid API authentication response.",
        );
      token = {
        value: parsed.data.access_token,
        expiresAt: Date.now() + parsed.data.expires_in * 1000,
        key,
      };
      return token.value;
    })();
  try {
    return await requestingToken;
  } finally {
    requestingToken = undefined;
  }
}
export async function osuApi(
  path: string,
  attributes?: {
    mods: string[];
    ruleset: "osu" | "taiko" | "fruits" | "mania";
  },
): Promise<unknown> {
  if (attributes) {
    const valid = z
      .object({
        mods: z.array(z.enum(["HD", "HR", "DT", "EZ", "HT"])).max(3),
        ruleset: z.enum(["osu", "taiko", "fruits", "mania"]),
      })
      .strict()
      .safeParse(attributes);
    if (!/^\/beatmaps\/[1-9]\d*\/attributes$/.test(path) || !valid.success)
      throw new HttpError(400, "Invalid beatmap attribute request.");
  }
  if (
    !attributes &&
    !/^\/(?:beatmaps\/[1-9]\d*|users\/[1-9]\d*\/(?:osu|taiko|fruits|mania)\?key=id|matches\/[1-9]\d*(?:\?(?:before|after)=\d+&limit=100|\?limit=100)?)$/.test(
      path,
    ) &&
    !/^\/users\/@(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-F]{2}){1,300}\/osu$/.test(
      path,
    ) &&
    !/^\/beatmaps\?ids\[\]=[1-9]\d*(?:&ids\[\]=[1-9]\d*){0,49}$/.test(path)
  )
    throw new HttpError(400, "Invalid osu! API resource.");
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await providerFetch(`https://osu.ppy.sh/api/v2${path}`, {
      ...(attributes
        ? { method: "POST", body: JSON.stringify(attributes) }
        : {}),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${await clientToken()}`,
        "x-api-version": "20220705",
        ...(attributes ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (response.status === 401 && attempt === 0) {
      token = undefined;
      continue;
    }
    if (response.status === 404)
      throw new HttpError(
        404,
        "The osu! record is unavailable or deleted. Saved records were preserved.",
      );
    if (response.status === 429)
      throw new HttpError(
        429,
        "osu! rate limit reached. Wait before retrying; saved records were preserved.",
      );
    if (response.status >= 500 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    if (!response.ok)
      throw new HttpError(
        502,
        "osu! could not return this record. Saved records were preserved.",
      );
    const reader = response.body?.getReader();
    if (!reader) throw new HttpError(502, "osu! returned an empty response.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new HttpError(
          502,
          "osu! returned too much data. Narrow the import.",
        );
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new HttpError(502, "osu! returned invalid JSON.");
    }
  }
  throw new HttpError(502, "osu! API authorization failed.");
}
