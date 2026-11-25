import env from "@next/env";
import { closeDb } from "../src/db";
import { refreshChatIndex } from "../src/lib/chat-index-worker";

async function main() {
  env.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  try {
    const result = await refreshChatIndex((progress) =>
      console.log(
        JSON.stringify({ event: "chat_artwork_progress", ...progress }),
      ),
    );
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main().catch(() => {
  console.error(
    "Chat index update failed. Check the database and embedding service configuration.",
  );
  process.exitCode = 1;
});
