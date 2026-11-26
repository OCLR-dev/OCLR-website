import env from "@next/env";
import { closeDb } from "../src/db";
import { safeChatError } from "../src/lib/chat-trace";
import { refreshChatIndex } from "../src/lib/chat-index-worker";

async function main() {
  env.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  try {
    const result = await refreshChatIndex(
      (progress) =>
        console.log(
          JSON.stringify({ event: "chat_artwork_progress", ...progress }),
        ),
      (event) => console.log(JSON.stringify(event)),
    );
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "chat_index_failure",
      stage: "worker",
      ...safeChatError(error),
    }),
  );
  process.exitCode = 1;
});
