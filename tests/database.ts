import { localDatabase } from "../scripts/development-database";
/** Destructive fixtures require an explicitly supplied, clearly named test database. */
export function assertTestDatabase(
  value: string | undefined,
): asserts value is string {
  if (!value) throw new Error("An isolated TEST_DATABASE_URL is required");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid TEST_DATABASE_URL");
  }
  const name = decodeURIComponent(url.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !/^[a-z0-9_-]+$/i.test(name) ||
    name.toLowerCase() === localDatabase.name ||
    ["database", "dbname", "host", "hostaddr", "port", "service"].some((key) =>
      url.searchParams.has(key),
    ) ||
    !/(?:^|[_-])test(?:$|[_-])/i.test(name)
  )
    throw new Error(
      "Use an isolated database with a separate 'test' name segment (for example oclr_test)",
    );
}
