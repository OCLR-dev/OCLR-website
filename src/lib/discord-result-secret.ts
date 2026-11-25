import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { appUrl } from "./app-url";

export function discordResultRuntime() {
  const rawKey = process.env.OCLR_DISCORD_RESULT_KEY;
  if (!rawKey || !/^[0-9a-f]{64}$/i.test(rawKey)) return null;
  try {
    return { key: Buffer.from(rawKey, "hex"), origin: appUrl() };
  } catch {
    return null;
  }
}

export function sealDiscordWebhook(url: string, key: Buffer, scope: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(scope));
  const ciphertext = Buffer.concat([
    cipher.update(url, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64",
  );
}

export function openDiscordWebhook(sealed: string, key: Buffer, scope: string) {
  const packet = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, packet.subarray(0, 12));
  decipher.setAAD(Buffer.from(scope));
  decipher.setAuthTag(packet.subarray(12, 28));
  return Buffer.concat([
    decipher.update(packet.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
