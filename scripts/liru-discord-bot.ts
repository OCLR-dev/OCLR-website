import { z } from "zod";
import { guildCommand } from "../src/discord-bot/commands";
import {
  interactionHandler,
  publicKeyHex,
  snowflake,
} from "../src/discord-bot/interactions";
import { botServer } from "../src/discord-bot/server";

function setting<T extends z.ZodType>(
  name: string,
  schema: T,
  defaultValue?: string,
) {
  const value = schema.safeParse(process.env[name] ?? defaultValue);
  if (!value.success)
    throw new Error(`Configure ${name} before running Liru Bot.`);
  return value.data;
}

const originSchema = z
  .url()
  .transform((value) => new URL(value))
  .refine(
    (url) =>
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password,
  )
  .transform((url) => url.origin);

async function register(applicationId: string, guildId: string) {
  const token = setting(
    "LIRU_DISCORD_BOT_TOKEN",
    z
      .string()
      .min(1)
      .regex(/^[a-z0-9_.-]+$/i),
  );
  const url = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(guildCommand()),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  await response?.body?.cancel();
  if (!response?.ok)
    throw new Error(
      response
        ? `Discord registration returned HTTP ${response.status}.`
        : "Discord registration request failed.",
    );
  console.info("Registered /oclr in the configured Discord server.");
}

async function main() {
  const action = process.argv[2];
  if (action !== "serve" && action !== "register")
    throw new Error("Choose serve or register.");
  const applicationId = setting("LIRU_DISCORD_APPLICATION_ID", snowflake);
  const guildId = setting("LIRU_DISCORD_GUILD_ID", snowflake);
  if (action === "register") return register(applicationId, guildId);

  const origin = setting("LIRU_OCLR_ORIGIN", originSchema);
  const publicKey = setting("LIRU_DISCORD_PUBLIC_KEY", publicKeyHex);
  const port = setting(
    "LIRU_BOT_PORT",
    z.coerce.number().int().min(1).max(65535),
    "9312",
  );
  const host = setting("LIRU_BOT_HOST", z.string().trim().min(1), "127.0.0.1");
  const server = botServer(
    interactionHandler({ applicationId, guildId, publicKey, origin }),
  );
  server.on("error", (error) => {
    console.error(
      `Liru Bot HTTP listener failed (${(error as NodeJS.ErrnoException).code ?? "unknown"}).`,
    );
    process.exitCode = 1;
  });
  server.listen(port, host, () =>
    console.info("Liru Bot HTTP listener is ready."),
  );
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => server.close());
}

await main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
