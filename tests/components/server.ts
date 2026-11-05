// DB-free browser host for actual client components. Only HTTP is mocked by tests.
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
import { build } from "esbuild";
import { createServer } from "node:http";
import { basename, resolve } from "node:path";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { bundledSeasonThemes } from "../fixtures/theme-assets";

const themeAssets = new Set(
  bundledSeasonThemes.flatMap((theme) => theme.assets),
);
const tournamentArtwork = new Set([
  "/oclr-s11-square-logo.webp",
  "/oclr-s11-website-background.webp",
  "/oclr-s11-key-visual.webp",
]);

const bundle = await build({
  entryPoints: [
    "tests/components/event-players.tsx",
    "tests/components/public-results.tsx",
    "tests/components/exhibition-pool-import.tsx",
    "tests/components/action-loading.tsx",
    "tests/components/player-sidebar.tsx",
    "tests/components/player-timeline.tsx",
    "tests/components/staff-navigation.tsx",
    "tests/components/staff-role-form.tsx",
    "tests/components/country-flags.tsx",
    "tests/components/header.tsx",
    "tests/components/appearance-navigation.tsx",
    "tests/components/schedule-selection.tsx",
    "tests/components/practice-records.tsx",
    "tests/components/referee-panel.tsx",
    "tests/components/force-fixture-delete.tsx",
    "tests/components/round-referee-policy.tsx",
    "tests/components/info-note.tsx",
    "tests/components/mappool-actions.tsx",
    "tests/components/public-mappools.tsx",
    "tests/components/workbench-compact.tsx",
    "tests/components/stage-groups.tsx",
    "tests/components/streaming-manager.tsx",
    "tests/components/captain-manager.tsx",
    "tests/components/tournament-settings.tsx",
    "tests/components/archive-bracket.tsx",
    "tests/components/ocl-chess.tsx",
    "tests/components/s3-bracket.tsx",
    "tests/components/s5-bracket.tsx",
    "tests/components/player-message-board.tsx",
    "tests/components/event-statistics.tsx",
    "tests/components/statistics-explorer.tsx",
    "tests/components/team-editor.tsx",
    "tests/components/statistics-manager.tsx",
    "tests/components/rank-chart.tsx",
    "tests/components/player-id-badge.tsx",
    "tests/components/player-profile-cover.tsx",
    "tests/components/player-profile-no-cover.tsx",
    "tests/components/backup-manager.tsx",
  ],
  alias: { "next/image": resolve("tests/components/next-image.ts") },
  external: ["/rookie-stage.svg", "/themes/*", "/fonts/*", "/branding/*"],
  bundle: true,
  write: false,
  outdir: "component-bundle",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
});
// Resolve theme declarations where tests measure actual control geometry.
const themedStyles = new Map(
  await Promise.all(
    [
      "action-loading.css",
      "player-sidebar.css",
      "staff-navigation.css",
      "staff-role-form.css",
      "mappool-actions.css",
      "public-mappools.css",
      "workbench-compact.css",
      "country-flags.css",
      "practice-records.css",
      "schedule-selection.css",
      "streaming-manager.css",
      "captain-manager.css",
      "tournament-settings.css",
    ].map(async (name) => {
      const file = bundle.outputFiles.find(
        (file) => basename(file.path) === name,
      )!;
      const result = await postcss([tailwind()]).process(file.text, {
        from: file.path,
      });
      return [file, result.css] as const;
    }),
  ),
);
createServer((request, response) => {
  const file = bundle.outputFiles.find(
    (output) => `/${basename(output.path)}` === request.url,
  );
  if (file) {
    response.setHeader(
      "Content-Type",
      file.path.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/javascript; charset=utf-8",
    );
    response.end(themedStyles.get(file) ?? file.contents);
  } else if (/^\/appearance-styles\/[a-z-]+\.css$/.test(request.url ?? "")) {
    response.setHeader("Content-Type", "text/css; charset=utf-8");
    response.end(readFileSync(resolve("public", `.${request.url}`)));
  } else if (
    themeAssets.has(request.url ?? "") ||
    tournamentArtwork.has(request.url ?? "")
  ) {
    response.setHeader(
      "Content-Type",
      request.url!.endsWith(".svg") ? "image/svg+xml" : "image/webp",
    );
    response.end(readFileSync(resolve("public", `.${request.url}`)));
  } else if (
    /^\/flags\/twemoji\/1f1[e-f][\da-f]-1f1[e-f][\da-f]\.svg$/.test(
      request.url ?? "",
    )
  ) {
    response.setHeader("Content-Type", "image/svg+xml");
    response.end(readFileSync(resolve("public", `.${request.url}`)));
  } else if (request.url?.startsWith("/api/")) {
    response.writeHead(404).end();
  } else {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
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
    const entry = request.url?.startsWith("/public-results")
      ? "public-results"
      : request.url?.startsWith("/header")
        ? "header"
        : request.url?.startsWith("/referee-panel")
          ? "referee-panel"
          : request.url?.startsWith("/force-fixture-delete")
            ? "force-fixture-delete"
            : request.url?.startsWith("/round-referee-policy")
              ? "round-referee-policy"
              : request.url?.startsWith("/stage-groups")
                ? "stage-groups"
                : request.url?.startsWith("/info-note")
                  ? "info-note"
                  : request.url?.startsWith("/s5-bracket")
                    ? "s5-bracket"
                    : request.url?.startsWith("/s3-bracket")
                      ? "s3-bracket"
                      : request.url?.startsWith("/archive-bracket")
                        ? "archive-bracket"
                        : request.url?.startsWith("/ocl-chess")
                          ? "ocl-chess"
                          : request.url?.startsWith("/statistics-manager")
                            ? "statistics-manager"
                            : request.url?.startsWith("/team-editor")
                              ? "team-editor"
                              : request.url?.startsWith("/event-statistics")
                                ? "event-statistics"
                                : request.url?.startsWith(
                                      "/statistics-explorer",
                                    )
                                  ? "statistics-explorer"
                                  : request.url?.startsWith("/player-id-badge")
                                    ? "player-id-badge"
                                    : request.url?.startsWith(
                                          "/player-profile-cover",
                                        )
                                      ? "player-profile-cover"
                                      : request.url?.startsWith(
                                            "/player-profile-no-cover",
                                          )
                                        ? "player-profile-no-cover"
                                        : request.url?.startsWith("/rank-chart")
                                          ? "rank-chart"
                                          : request.url?.startsWith(
                                                "/schedule-selection",
                                              )
                                            ? "schedule-selection"
                                            : request.url?.startsWith(
                                                  "/practice-records",
                                                )
                                              ? "practice-records"
                                              : request.url?.startsWith(
                                                    "/mappool-actions",
                                                  )
                                                ? "mappool-actions"
                                                : request.url?.startsWith(
                                                      "/streaming-manager",
                                                    )
                                                  ? "streaming-manager"
                                                  : request.url?.startsWith(
                                                        "/captain-manager",
                                                      )
                                                    ? "captain-manager"
                                                    : request.url?.startsWith(
                                                          "/tournament-settings",
                                                        )
                                                      ? "tournament-settings"
                                                      : "player-message-board";
    const fixture = request.url?.startsWith("/exhibition-pool-import")
      ? "exhibition-pool-import"
      : request.url?.startsWith("/public-mappools")
        ? "public-mappools"
        : request.url?.startsWith("/action-loading")
          ? "action-loading"
          : request.url?.startsWith("/staff-role-form")
            ? "staff-role-form"
            : request.url?.startsWith("/player-sidebar")
              ? "player-sidebar"
              : request.url?.startsWith("/staff-navigation")
                ? "staff-navigation"
                : request.url?.startsWith("/player-timeline")
                  ? "player-timeline"
                  : request.url?.startsWith("/workbench-compact")
                    ? "workbench-compact"
                    : request.url?.startsWith("/country-flags")
                      ? "country-flags"
                      : entry;
    const fixtureName = request.url?.startsWith("/event-players")
      ? "event-players"
      : request.url?.startsWith("/appearance-navigation")
        ? "appearance-navigation"
        : request.url?.startsWith("/backup-manager")
          ? "backup-manager"
          : fixture;
    response.end(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/${fixtureName}.css"></head><body><div id="root"></div><script nonce="${nonce}" src="/${fixtureName}.js"></script></body></html>`,
    );
  }
}).listen(
  Number(
    process.env.COMPONENT_TEST_PORT ??
      process.env.OCLR_COMPONENT_TEST_PORT ??
      31449,
  ),
  "127.0.0.1",
);
