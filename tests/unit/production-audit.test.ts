import { describe, expect, it } from "vitest";
import { productionAuditResult } from "../../scripts/check-production-audit";

const watcher = "node_modules/@parcel/watcher";
const picomatch = watcher + "/node_modules/picomatch";
const packages = {
  "node_modules/next-intl": { version: "4.14.9" },
  [watcher]: { version: "2.6.0" },
  [picomatch]: { version: "4.0.7" },
};

function extractorReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      "@parcel/watcher": { via: ["picomatch"], nodes: [watcher] },
      picomatch: {
        via: [{ url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf" }],
        nodes: [picomatch],
      },
    },
    metadata: { vulnerabilities: { total: 2, high: 2 } },
  };
}

describe("production dependency audit", () => {
  it("accepts a successful, clean report", () => {
    const report = {
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: { vulnerabilities: { total: 0, high: 0 } },
    };
    expect(productionAuditResult(0, report, {})).toBe("clean");
    expect(productionAuditResult(1, report, {})).toBe("failed");
  });

  it("accepts the known extractor finding only for the reviewed lockfile versions", () => {
    const report = extractorReport();
    expect(productionAuditResult(1, report, packages)).toBe(
      "extractor-exception",
    );
    expect(
      productionAuditResult(1, report, {
        ...packages,
        ["node_modules/next-intl"]: { version: "4.15.1" },
      }),
    ).toBe("failed");
  });

  it("rejects a second advisory on the same package", () => {
    const report = extractorReport();
    report.vulnerabilities.picomatch.via.push({
      url: "https://example.com/advisory",
    });
    expect(productionAuditResult(1, report, packages)).toBe("failed");
  });

  it("rejects another installed copy or a separate package finding", () => {
    const report = extractorReport();
    report.vulnerabilities.picomatch.nodes.push("node_modules/picomatch");
    expect(productionAuditResult(1, report, packages)).toBe("failed");

    const extraFinding = extractorReport();
    expect(
      productionAuditResult(
        1,
        {
          ...extraFinding,
          vulnerabilities: {
            ...extraFinding.vulnerabilities,
            zod: {
              via: [{ url: "https://example.com/advisory" }],
              nodes: ["node_modules/zod"],
            },
          },
          metadata: { vulnerabilities: { total: 3, high: 2 } },
        },
        packages,
      ),
    ).toBe("failed");
  });
});
