import { expect, it } from "vitest";
import { assertTestDatabase } from "../database";
it("requires a distinct test database name rather than a misleading substring", () => {
  for (const name of [
    "oclr_test",
    "test",
    "oclr-test-migration",
    "oclr_operations_migration_20261020_test",
  ])
    expect(() =>
      assertTestDatabase(`postgres://127.0.0.1/${name}`),
    ).not.toThrow();
  for (const input of [
    undefined,
    "",
    "not a URL",
    "https://example.test/oclr_test",
    "postgres://127.0.0.1/contest",
    "postgres://127.0.0.1/oclr_production",
    "postgres://127.0.0.1/latest",
    "postgres://127.0.0.1/%2Ftest",
  ])
    expect(() => assertTestDatabase(input)).toThrow();
});

it("rejects preview aliases and effective target overrides before connecting (#454)", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]", "database.invalid"])
    for (const name of [
      "oclr_frontend_test",
      "%6fclr_frontend_test",
      "oclr_frontend_%74est",
      "OCLR_FRONTEND_TEST",
    ])
      expect(() =>
        assertTestDatabase(`postgresql://${host}:55434/${name}`),
      ).toThrow();
  for (const key of [
    "database",
    "dbname",
    "host",
    "hostaddr",
    "port",
    "service",
  ])
    expect(() =>
      assertTestDatabase(
        `postgresql://127.0.0.1/oclr_test?${key}=oclr_frontend_test`,
      ),
    ).toThrow();
  expect(() =>
    assertTestDatabase("postgresql://127.0.0.1/oclr_test?sslmode=disable"),
  ).not.toThrow();
});
