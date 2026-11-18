import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const advisory = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
const watcherPath = "node_modules/@parcel/watcher";
const picomatchPath = watcherPath + "/node_modules/picomatch";

type Finding = {
  via: (string | { url: string })[];
  nodes: string[];
};

type AuditReport = {
  auditReportVersion: number;
  vulnerabilities: Record<string, Finding>;
  metadata: { vulnerabilities: { total: number; high: number } };
};

type LockedPackages = Record<string, { version: string }>;

export function productionAuditResult(
  status: number | null,
  report: AuditReport,
  packages: LockedPackages,
): "clean" | "extractor-exception" | "failed" {
  const count = Object.keys(report.vulnerabilities).length;
  const totals = report.metadata.vulnerabilities;
  if (report.auditReportVersion !== 2 || totals.total !== count)
    return "failed";
  if (status === 0 && count === 0) return "clean";

  const picomatch = report.vulnerabilities.picomatch;
  const watcher = report.vulnerabilities["@parcel/watcher"];
  const cause = picomatch?.via[0];
  if (
    status === 1 &&
    count === 2 &&
    totals.high === 2 &&
    packages["node_modules/next-intl"]?.version === "4.14.9" &&
    packages[watcherPath]?.version === "2.6.0" &&
    packages[picomatchPath]?.version === "4.0.7" &&
    picomatch?.nodes.length === 1 &&
    picomatch.nodes[0] === picomatchPath &&
    picomatch.via.length === 1 &&
    typeof cause === "object" &&
    cause?.url === advisory &&
    watcher?.nodes.length === 1 &&
    watcher.nodes[0] === watcherPath &&
    watcher.via.length === 1 &&
    watcher.via[0] === "picomatch"
  ) {
    return "extractor-exception";
  }
  return "failed";
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.error) throw result.error;

  // Keep the complete report visible, including the finding accepted below.
  process.stdout.write(result.stdout);
  const report = JSON.parse(result.stdout);
  const { packages } = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  switch (productionAuditResult(result.status, report, packages)) {
    case "extractor-exception":
      console.warn(
        `Temporary CI exception for the disabled next-intl extractor: ${advisory}`,
      );
      break;
    case "failed":
      process.exitCode = 1;
  }
}
