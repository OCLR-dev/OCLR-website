import { describe, expect, it } from "vitest";
import { planCi, assertCiGate, type CiPlan } from "../../scripts/ci-plan";

function needs(plan: CiPlan) {
  return {
    plan: { result: "success", outputs: { json: JSON.stringify(plan) } },
    verify: { result: "success" },
    build: { result: "success" },
    e2e: { result: "success" },
    "header-e2e": { result: "success" },
    "remote-e2e": { result: "success" },
    "remote-matrix": { result: plan.remote_matrix ? "success" : "skipped" },
  };
}
describe("CI coverage decisions", () => {
  it.each([
    ["README.zh-Hant.md"],
    ["docs/development.md", "public/archive/s2/artwork.avif"],
    ["tests/e2e/registration.spec.ts"],
  ])(
    "keeps all functional tests and representative headers for %j",
    (...files) => {
      expect(planCi(files)).toMatchObject({
        full: false,
        header_mode: "smoke",
        remote_matrix: false,
      });
    },
  );
  it("expands a changed theme without omitting other core header appearances", () => {
    expect(
      planCi(["src/app/manga-theme.css", "src/app/clay-theme.css"]),
    ).toMatchObject({
      full: false,
      header_mode: "full",
      header_appearances: "claymorphism,manga-halftone",
      remote_matrix: false,
    });
  });
  it.each([
    "src/app/globals.css",
    "src/components/header.tsx",
    "src/app/layout.tsx",
    "public/fonts/header.woff2",
    "public/oclr-wordmark.svg",
  ])("expands all header appearances for %s", (file) =>
    expect(planCi([file])).toMatchObject({
      header_mode: "full",
      header_appearances: "",
    }),
  );
  it.each([
    "src/app/api/v1/site/route.ts",
    "src/app/tournaments/[edition]/page.tsx",
    "src/components/match-details.tsx",
    "src/lib/read-api.ts",
    "src/data/archive.json",
    "src/i18n/request.ts",
    "drizzle/0045.sql",
    "tests/remote-e2e/full-site.spec.ts",
  ])("requires the complete remote read matrix for %s", (file) =>
    expect(planCi([file]).remote_matrix).toBe(true),
  );
  it.each([
    { files: undefined },
    ...[
      "scripts/new-tool.ts",
      ".github/workflows/ci.yml",
      "package-lock.json",
      "docs/remote-coverage.json",
      "tests/fixtures/new.ts",
      "src/app/new-theme.css",
      "../src/app/globals.css",
      "",
    ].map((file) => ({ files: [file] })),
  ])("falls back to full acceptance for unknown input $files", ({ files }) =>
    expect(planCi(files)).toMatchObject({
      full: true,
      remote_matrix: true,
      header_mode: "full",
      header_appearances: "",
    }),
  );
  it("escapes filenames before line-oriented workflow outputs", () => {
    expect(planCi(["unknown\nremote_matrix=false"]).reason).not.toContain("\n");
  });
  it("honors explicit complete acceptance even for prose-only changes", () => {
    expect(planCi(["README.md"], true).full).toBe(true);
  });
});
describe("required CI gate", () => {
  for (const plan of [
    planCi(["README.md"]),
    planCi(["src/lib/read-api.ts"]),
    planCi(undefined),
  ]) {
    it("accepts precisely the jobs required by " + plan.reason, () => {
      expect(() => assertCiGate(needs(plan))).not.toThrow();
    });
    for (const job of [
      "plan",
      "verify",
      "build",
      "e2e",
      "header-e2e",
      "remote-e2e",
    ])
      for (const result of ["failure", "cancelled", "skipped", ""])
        it("rejects " + job + " " + result + " for " + plan.reason, () => {
          const input = needs(plan);
          input[job as keyof typeof input].result = result;
          expect(() => assertCiGate(input)).toThrow();
        });
    it("never ignores a failed conditional remote job", () => {
      const input = needs(plan);
      input["remote-matrix"].result = "failure";
      expect(() => assertCiGate(input)).toThrow();
    });
  }
  it("rejects a skipped required remote matrix", () => {
    const input = needs(planCi(undefined));
    input["remote-matrix"].result = "skipped";
    expect(() => assertCiGate(input)).toThrow();
  });
  it.each([
    "",
    "{}",
    "{",
    JSON.stringify({
      full: true,
      remote_matrix: false,
      header_mode: "smoke",
      header_appearances: "",
    }),
  ])("rejects absent, malformed or inconsistent plans", (json) => {
    const input = needs(planCi(undefined));
    input.plan.outputs.json = json;
    expect(() => assertCiGate(input)).toThrow();
  });
});
