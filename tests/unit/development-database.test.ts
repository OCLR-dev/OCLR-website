import { describe, expect, it } from "vitest";
import {
  assertDevelopmentDatabase,
  developmentEnvironment,
} from "../../scripts/development-database";

const local = "postgresql://127.0.0.1:55434/oclr_frontend_test";
describe("local development seed database boundary", () => {
  it("allows only the explicitly selected local frontend test database", () => {
    expect(() =>
      assertDevelopmentDatabase(local, local, "development"),
    ).not.toThrow();
    const configured = local + "?sslmode=disable";
    expect(() =>
      assertDevelopmentDatabase(configured, configured, "development"),
    ).not.toThrow();
  });
  it.each([
    undefined,
    "not-a-url",
    "https://127.0.0.1:55434/oclr_frontend_test",
    "postgresql://db.example.com:55434/oclr_frontend_test",
    "postgresql://127.0.0.1:5432/oclr_frontend_test",
    "postgresql://127.0.0.1:55434/oclr",
    "postgresql://127.0.0.1:55434/some_other_test",
    local + "?host=db.example.com",
    local + "?port=5432",
    local + "?dbname=oclr",
  ])("rejects a missing, remote or unrelated target (%s)", (url) => {
    expect(() => assertDevelopmentDatabase(url, url, "development")).toThrow();
  });
  it("requires the same explicit preview confirmation", () => {
    expect(() =>
      assertDevelopmentDatabase(local, undefined, "development"),
    ).toThrow();
    expect(() =>
      assertDevelopmentDatabase(
        local,
        local + "?application_name=other",
        "development",
      ),
    ).toThrow();
  });
  it("rejects production even for the local target", () => {
    expect(() =>
      assertDevelopmentDatabase(local, local, "production"),
    ).toThrow();
  });
});

it("never configures the persistent preview as an automated-test target", () => {
  const content = developmentEnvironment(local);
  expect(content).toContain(`OCLR_DEVELOPMENT_DATABASE_URL=${local}`);
  expect(content).not.toContain("TEST_DATABASE_URL=");
});
