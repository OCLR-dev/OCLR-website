// DB-free browser host for actual client components. Only HTTP is mocked by tests.
import { build } from "esbuild";
import { createServer } from "node:http";
import { basename } from "node:path";

const bundle = await build({
  entryPoints: ["tests/components/player-message-board.tsx"],
  bundle: true,
  write: false,
  outdir: "component-bundle",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
});
createServer((request, response) => {
  const file = bundle.outputFiles.find(
    (output) => `/${basename(output.path)}` === request.url,
  );
  if (file) {
    response.setHeader(
      "Content-Type",
      file.path.endsWith(".css") ? "text/css" : "text/javascript",
    );
    response.end(file.contents);
  } else if (request.url?.startsWith("/api/")) {
    response.writeHead(404).end();
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/player-message-board.css"></head><body><div id="root"></div><script src="/player-message-board.js"></script></body></html>`,
    );
  }
}).listen(31449, "127.0.0.1");
