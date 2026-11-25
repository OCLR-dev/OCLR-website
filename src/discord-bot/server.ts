import { createServer, type IncomingMessage } from "node:http";
import { interactionHandler } from "./interactions";

const maxBodyBytes = 32 * 1024;

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > maxBodyBytes) {
      request.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

export function botServer(interact: ReturnType<typeof interactionHandler>) {
  const server = createServer(
    {
      requestTimeout: 5_000,
      headersTimeout: 5_000,
      connectionsCheckingInterval: 1_000,
    },
    async (request, response) => {
      response.setHeader("cache-control", "no-store");
      if (request.url !== "/interactions") {
        response.writeHead(404).end();
        return;
      }
      if (request.method !== "POST") {
        response.writeHead(405, { allow: "POST" }).end();
        return;
      }
      const signature = request.headers["x-signature-ed25519"];
      const timestamp = request.headers["x-signature-timestamp"];
      if (typeof signature !== "string" || typeof timestamp !== "string") {
        response.writeHead(401).end();
        return;
      }
      try {
        const body = await readBody(request);
        if (!body) {
          response.writeHead(413).end();
          return;
        }
        const ack = await interact({ body, signature, timestamp });
        if (ack.body) response.setHeader("content-type", "application/json");
        response
          .writeHead(ack.status)
          .end(ack.body && JSON.stringify(ack.body));
        // Dispatch after queuing the HTTP response; upstream latency must not delay it.
        if (ack.finish) void ack.finish();
      } catch {
        if (!response.headersSent) response.writeHead(500).end();
      }
    },
  );
  return server;
}
