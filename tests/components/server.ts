// DB-free browser host for actual client components. Only HTTP is mocked by tests.
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
import { build } from "esbuild";
import { createServer } from "node:http";
import { basename, resolve } from "node:path";

const bundle = await build({
  entryPoints: [
    "tests/components/archive-bracket.tsx",
    "tests/components/ocl-chess.tsx",
    "tests/components/player-message-board.tsx",
    "tests/components/event-statistics.tsx",
    "tests/components/statistics-explorer.tsx",
    "tests/components/team-editor.tsx",
    "tests/components/statistics-manager.tsx",
  ],
  alias: { "next/image": resolve("tests/components/next-image.ts") },
  bundle: true,
  external: ["/rookie-stage.svg"],
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
    let nonce = "";
    if (request.url?.startsWith("/team-editor")) {
      const policy = proxy(
        new NextRequest("http://127.0.0.1:31449/team-editor", {
          headers: { host: "127.0.0.1:31449" },
        }),
      ).headers.get("content-security-policy")!;
      response.setHeader("Content-Security-Policy", policy);
      nonce = /'nonce-([^']+)'/.exec(policy)![1];
    }
    const entry = request.url?.startsWith("/archive-bracket")
      ? "archive-bracket"
      : request.url?.startsWith("/ocl-chess")
        ? "ocl-chess"
        : request.url?.startsWith("/statistics-manager")
          ? "statistics-manager"
          : request.url?.startsWith("/team-editor")
            ? "team-editor"
            : request.url?.startsWith("/event-statistics")
              ? "event-statistics"
              : request.url?.startsWith("/statistics-explorer")
                ? "statistics-explorer"
                : "player-message-board";
    response.end(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/${entry}.css"></head><body><div id="root"></div><script nonce="${nonce}" src="/${entry}.js"></script></body></html>`,
    );
  }
}).listen(31449, "127.0.0.1");
