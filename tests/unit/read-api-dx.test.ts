import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readApiSpecification } from "../../src/lib/read-api-openapi";
import { readOperations } from "../../src/lib/read-api-operations";
import { readQuerySchema } from "../../src/lib/read-api-queries";
import {
  supportsFullSiteRead,
  readContractVersion,
} from "../../src/lib/read-api-version";
import matrix from "../../docs/remote-coverage.json" with { type: "json" };
describe("read API DX contract", () => {
  it("keeps generated DTOs and the complete route/client inventory synchronized with source", () => {
    for (const script of [
      "scripts/generate-extended-contracts.ts",
      "scripts/generate-remote-matrix.ts",
    ])
      execFileSync(process.execPath, ["--import", "tsx", script, "--check"], {
        stdio: "pipe",
      });
  }, 60000);
  it("resolves every OpenAPI schema reference and maps all read operations to issues, query models and page evidence", () => {
    const spec = readApiSpecification();
    expect(spec.info.version).toBe(readContractVersion);
    const document = spec as unknown as Record<string, unknown>;
    function visit(value: unknown) {
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (key === "$ref") {
          expect(typeof item).toBe("string");
          let target: unknown = document;
          for (const part of (item as string).slice(2).split("/"))
            target = (target as Record<string, unknown>)?.[
              part.replaceAll("~1", "/").replaceAll("~0", "~")
            ];
          expect(target, item as string).toBeDefined();
        } else visit(item);
      }
    }
    visit(spec);
    for (const op of readOperations) {
      expect(op.issues.some((n) => [268, 269, 270, 271, 272].includes(n))).toBe(
        true,
      );
      expect(readQuerySchema(op.id, op.query)).toBeDefined();
      expect(spec.paths["/api/v1" + op.path]).toBeDefined();
    }
    const covered = new Set(matrix.rows.flatMap((r) => r.operations));
    for (const op of readOperations.filter((op) => op.issues.includes(271)))
      expect(
        covered.has(op.id) ||
          matrix.rows.some((r) =>
            r.operations.includes("ALL_REGISTERED_READS"),
          ),
        op.id,
      ).toBe(true);
    expect(matrix.rows.filter((r) => r.kind === "page").length).toBeGreaterThan(
      50,
    );
  });
  it("documents and validates exact filter types and the minimum compatible additive v1 version", () => {
    for (const value of [null, "1.0.0", "2.0.0", "1.1", "unavailable"])
      expect(supportsFullSiteRead(value)).toBe(false);
    for (const value of ["1.1.0", "1.2.3"])
      expect(supportsFullSiteRead(value)).toBe(true);
    expect(
      readQuerySchema("statisticsWorkspace", ["fixtureId"]).safeParse({
        fixtureId: "recorded-final",
      }).success,
    ).toBe(true);
    expect(
      readQuerySchema("streamingWorkspace", ["fixtureId"]).safeParse({
        fixtureId: "recorded-final",
      }).success,
    ).toBe(false);
    expect(
      readQuerySchema("listApplications", [
        "q",
        "edition",
        "status",
        "page",
      ]).safeParse({ status: "invented", page: "0" }).success,
    ).toBe(false);
    expect(
      readQuerySchema("publicNewsModel", ["locale"]).safeParse({
        locale: "zh-Hant",
      }).success,
    ).toBe(true);
  });
});
