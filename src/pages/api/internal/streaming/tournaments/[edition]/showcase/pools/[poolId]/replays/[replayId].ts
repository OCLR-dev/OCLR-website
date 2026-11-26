import type { NextApiRequest } from "next";
import type { ServerResponse } from "node:http";
import { streamingShowcaseReplayFile } from "@/lib/streaming-showcase-read";

export const config = {
  // The replay service enforces the actual byte limit before sending a body.
  api: { bodyParser: false, responseLimit: false },
};

// App Router's Web Response bridge strips Content-Length. Send the already
// verified replay through Node's response so its byte count reaches the client.
export default async function showcaseReplayDownload(
  req: Pick<NextApiRequest, "query" | "method" | "headers" | "url">,
  res: ServerResponse,
) {
  const { edition, poolId, replayId } = req.query;
  if (
    typeof edition !== "string" ||
    typeof poolId !== "string" ||
    typeof replayId !== "string"
  ) {
    res.statusCode = 404;
    res.end();
    return;
  }

  const method = req.method ?? "GET";
  if (
    !["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(
      method,
    )
  ) {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.end();
    return;
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const request = new Request(new URL(req.url ?? "/", "http://localhost"), {
    method,
    headers,
  });
  const response = await streamingShowcaseReplayFile(
    request,
    edition,
    poolId,
    replayId,
  );
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (response.body) res.end(Buffer.from(await response.arrayBuffer()));
  else res.end();
}
