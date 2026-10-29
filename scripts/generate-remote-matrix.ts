import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { format } from "prettier";
import resources from "./extended-read-resources.json" with { type: "json" };
const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.posix.join(dir, e.name))
        : [path.posix.join(dir, e.name)],
    );
const known = new Map(resources.map((r) => [r.fn, r.id]));
for (const [fn, id] of Object.entries({
  frontendSite: "getPublicSite",
  frontendTournaments: "listPublicTournaments",
  frontendTournament: "getPublicTournament",
  frontendPlayers: "listPublicPlayers",
  frontendProfile: "getOclrProfile",
  frontendPrivateTournaments: "listStaffTournaments",
  frontendPrivateTournament: "getStaffTournament",
  frontendConnection: "getApiIdentity",
  currentUser: "getApiIdentity",
  requireUser: "getApiIdentity",
  requireStaff: "staffAccess",
  getPublicEditions: "listPublicTournaments",
  getPublicEdition: "publicEnrollment",
  getEdition: "privateSavedTournament",
  readTournament: "privateSavedTournament",
  getEditionChoices: "listStaffTournaments",
  frontendLegacyPlayers: "listPublicPlayers",
  publicPlayers: "listPublicPlayers",
  frontendLegacyProfile: "getPublicPlayer",
  publishedPlayerProfile: "getPublicPlayer",
  historicalPage: "publicEnrollment",
  publicEditionContext: "publicEnrollment",
  cachedOsuUserProfile: "getSavedProfile",
  getOsuUserProfile: "ownSavedProfile",
  verifyEligibility: "ownEligibility",
  privacyContact: "getPublicSite",
  publicNews: "publicNewsModel",
  publicNewsItem: "publicNewsModel",
}))
  known.set(fn, id);
const componentOps: Record<string, string[]> = {
  RegistrationList: ["listApplications", "listStaffTournaments", "staffAccess"],
  EventPlayers: ["publicPlayerMessages"],
  PlayerMessageBoard: ["publicPlayerMessages"],
  MappoolEditor: ["replayList", "downloadReplay"],
  BroadcastDraft: ["publicBroadcastDraft"],
  LiveDraft: ["publicDraft", "captainDraft"],
  PublicTeams: ["getTeamAvatar"],
  TeamEditor: ["getTeamAvatar"],
  CaptainManager: ["captainIdentities"],
  StaffDraft: ["staffDraft"],
  StreamingManager: ["streamingWorkspace"],
  MatchReview: ["matchReview"],
  HistoricalArchiveView: ["publicEnrollment"],
};
function hasReadHandler(file: string) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  return source.statements.some((node) => {
    if (ts.isFunctionDeclaration(node))
      return (
        ["GET", "HEAD"].includes(node.name?.text ?? "") &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      );
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    )
      return node.exportClause.elements.some((e) =>
        ["GET", "HEAD"].includes(e.name.text),
      );
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      return node.declarationList.declarations.some((d) =>
        ["GET", "HEAD"].includes(d.name.getText(source)),
      );
    return false;
  });
}
const files = [
  ...walk("src/app").filter(
    (p) =>
      /\/(?:page|layout)\.tsx$/.test(p) ||
      (/\/route\.ts$/.test(p) && hasReadHandler(p)),
  ),
  ...walk("src/components").filter(
    (p) =>
      /\.tsx?$/.test(p) &&
      /\b(?:usePoll|fetch)\(/.test(fs.readFileSync(p, "utf8")),
  ),
].sort();
const rows = files.map((file) => {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const operations = new Set<string>();
  for (const node of source.statements)
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    )
      for (const item of node.importClause.namedBindings.elements) {
        const name = item.propertyName?.text ?? item.name.text;
        const op = known.get(name);
        if (op) operations.add(op);
        for (const op of componentOps[name] ?? []) operations.add(op);
      }
  const clientOperations: Record<string, string[]> = {
    "live-draft": ["publicDraft", "captainDraft"],
    "broadcast-draft": ["publicBroadcastDraft"],
    "staff-draft": ["staffDraft"],
    "streaming-manager": ["streamingWorkspace"],
    "statistics-manager": ["statisticsWorkspace"],
    "mappool-replays": ["replayList", "downloadReplay"],
    "player-message-board": ["publicPlayerMessages"],
    "bws-review": ["staffBws"],
    "team-editor": ["getTeamAvatar"],
    "match-review": ["matchReview"],
  };
  for (const op of clientOperations[
    path.basename(file).replace(/\.tsx?$/, "")
  ] ?? [])
    operations.add(op);
  if (file.includes("/api/v1/")) operations.add("ALL_REGISTERED_READS");
  if (file.includes("/avatar/route")) operations.add("getTeamAvatar");
  if (file.includes("/replays/[replayId]/route"))
    operations.add("downloadReplay");
  if (file.includes("/register/page")) {
    operations.add("publicEnrollment");
    operations.add("publicEnrollmentState");
  }
  if (file.includes("/captains/page")) operations.add("captainIdentities");
  const denied =
    /\/api\/games\/|\/auth\/|\/api\/health\/|\/api\/developer\/|\/registrations\/export\//.test(
      file,
    );
  const remoteControl =
    file.includes("/remote/") ||
    file.includes("/login/") ||
    file.includes("/developer/page");
  const backendOnly = file.includes("/api/v1/");
  const kind = file.endsWith("/page.tsx")
    ? "page"
    : file.endsWith("/layout.tsx")
      ? "layout"
      : file.endsWith("/route.ts")
        ? "read-route"
        : "client";
  if (
    kind === "read-route" &&
    !denied &&
    !remoteControl &&
    !file.endsWith("/api/me/route.ts") &&
    ![...operations].some(
      (op) => !["getApiIdentity", "staffAccess"].includes(op),
    )
  )
    throw new Error("Classify the read model for " + file);
  return {
    file,
    kind,
    authority: backendOnly
      ? "backend-only"
      : denied
        ? "denied"
        : remoteControl
          ? "connection-control"
          : operations.size
            ? "saved-read"
            : kind === "client" &&
                /method:\s*["'](POST|PUT|PATCH|DELETE)/.test(text)
              ? "command-disabled"
              : "static-or-local-interaction",
    operations: [...operations].sort(),
    commands:
      "Denied in remote mode; connection management and preference cookies remain separate",
    metadata: text.includes("generateMetadata")
      ? "Same file; shared request adapter for dynamic data"
      : "Inherited or static",
    services: backendOnly
      ? ["src/lib/read-api.ts#readApiRoute"]
      : [...operations]
          .filter((op) => op !== "ALL_REGISTERED_READS")
          .map((op) => {
            const resource = resources.find((r) => r.id === op);
            return resource
              ? `src/lib/${resource.module}.ts#${resource.fn}`
              : `src/lib/public-read-models.ts / frontend-data.ts (${op})`;
          }),
    test: backendOnly
      ? "integration/read-api.test.ts + integration/extended-read.test.ts + e2e/read-api.spec.ts + remote-e2e/interactions.spec.ts"
      : kind === "client"
        ? "remote-e2e/interactions.spec.ts + existing e2e interaction tests"
        : "remote-e2e/full-site.spec.ts + integration/extended-read.test.ts",
    authorization: backendOnly
      ? "Authoritative backend public/Bearer checks; local remote frontend rejects these URLs with 403"
      : denied
        ? "Denied in remote mode"
        : file.includes("/admin/")
          ? "Live Developer + private scope; write controls disabled"
          : file.includes("/dashboard/") ||
              file.includes("/team/") ||
              file.includes("/draft/captain/")
            ? "Actual token subject; existing appointment checks"
            : "Existing publication/subject boundaries",
    adapter: backendOnly
      ? "Backend registry; frontend uses its legacy reads/local BFF instead of hosting another v1 backend"
      : denied
        ? "proxy rejection"
        : remoteControl
          ? "bounded in-memory connection"
          : operations.size
            ? "shared service wrapper → fixed v1 resource"
            : "no database; repository content/navigation/preferences",
    media: file.includes("/mappool")
      ? "Replay list/file authorization"
      : /team|bracket|schedule|matches/.test(file)
        ? "Published/protected avatar routes"
        : "Existing public assets",
    requiredVerification: backendOnly
      ? "Backend contract/CORS and local frontend 403 without database/provider access"
      : kind === "client"
        ? "Browser interaction/polling + API snapshot immutability"
        : denied
          ? "403 without database/provider access"
          : kind === "layout"
            ? "Rendered by matching page direct load and navigation"
            : "Desktop/mobile direct load, reload/navigation; authorized denial where applicable",
  };
});
const pages = files
  .filter((p) => p.endsWith("/page.tsx"))
  .map((p) => p.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/");
const reads = rows
  .filter(
    (r) =>
      r.kind === "read-route" &&
      r.authority !== "denied" &&
      !r.file.includes("/api/v1/"),
  )
  .map((r) => r.file.replace(/^src\/app/, "").replace(/\/route\.ts$/, ""));
const pathsOutput = await format(JSON.stringify({ pages, reads }), {
  parser: "json",
});
const pathsTarget = "src/lib/remote-route-paths.json";
if (process.argv.includes("--check")) {
  if (fs.readFileSync(pathsTarget, "utf8") !== pathsOutput)
    throw Error("Remote route allowlist drifted.");
} else fs.writeFileSync(pathsTarget, pathsOutput);
const output = await format(JSON.stringify({ issues: [271, 272], rows }), {
  parser: "json",
});
const target = "docs/remote-coverage.json";
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== output)
    throw Error(
      "Remote page/read-route matrix drifted; regenerate and extend browser evidence.",
    );
} else fs.writeFileSync(target, output);
console.log(
  `${rows.length} page/layout/read-route/client coverage rows checked.`,
);
