export const localDatabase = {
  container: "oclr-frontend-postgres",
  volume: "oclr-frontend-postgres-data",
  name: "oclr_frontend_test",
  user: "oclr_frontend",
  port: "55434",
  label: "frontend-test-v1",
} as const;

/** The demo writer is deliberately restricted to this persistent local preview database. */
export function assertDevelopmentDatabase(
  databaseUrl: string | undefined,
  developmentDatabaseUrl: string | undefined,
  nodeEnv = process.env.NODE_ENV,
) {
  if (nodeEnv === "production")
    throw new Error("Development data is disabled in production.");
  if (
    !databaseUrl ||
    !developmentDatabaseUrl ||
    databaseUrl !== developmentDatabaseUrl
  )
    throw new Error(
      "DATABASE_URL and OCLR_DEVELOPMENT_DATABASE_URL must identify the same local preview database.",
    );
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Invalid local test database configuration.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.port !== localDatabase.port ||
    url.pathname !== `/${localDatabase.name}` ||
    (url.searchParams.size > 0 &&
      (url.searchParams.size !== 1 ||
        url.searchParams.get("sslmode") !== "disable"))
  )
    throw new Error(
      `Development data requires the loopback database ${localDatabase.name} on port ${localDatabase.port}.`,
    );
}

/** Keep seed confirmation separate from disposable automated-test targets. */
export function developmentEnvironment(url: string) {
  return `# Private local frontend database; never commit this file.\nAPP_URL=http://localhost:3000\nDATABASE_URL=${url}\nOCLR_DEVELOPMENT_DATABASE_URL=${url}\n`;
}
