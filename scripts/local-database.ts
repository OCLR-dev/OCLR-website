import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  localDatabase as local,
  developmentEnvironment,
} from "./development-database";

function docker(args: string[], optional = false) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (!optional && (result.error || result.status !== 0))
    throw new Error(
      result.error?.message ?? result.stderr.trim() ?? "Docker command failed.",
    );
  return result;
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Local database setup is disabled in production.");
  if (process.env.DATABASE_URL || process.env.TEST_DATABASE_URL)
    throw new Error(
      "Unset exported DATABASE_URL and TEST_DATABASE_URL before using local setup. Existing connections are not changed.",
    );

  docker(["info", "--format", "{{.ServerVersion}}"]);
  const existing = docker(
    [
      "container",
      "inspect",
      "--format",
      '{{.Config.Image}}|{{index .Config.Labels "org.oclr.local-database"}}|{{json .HostConfig.PortBindings}}',
      local.container,
    ],
    true,
  );
  if (existing.status === 0) {
    const [image, label, ports] = existing.stdout.trim().split("|");
    const binding = JSON.parse(ports)["5432/tcp"];
    if (
      image !== "postgres:17" ||
      label !== local.label ||
      binding?.length !== 1 ||
      binding[0].HostIp !== "127.0.0.1" ||
      binding[0].HostPort !== local.port
    )
      throw new Error(
        "The existing container is not the isolated OCLR frontend database.",
      );
    if (!existsSync(".env.local"))
      throw new Error(
        "The local container exists, but .env.local is missing. Restore your private configuration before starting it.",
      );
    docker(["start", local.container]);
  } else {
    if (existsSync(".env.local"))
      throw new Error(
        ".env.local already exists and will not be read or overwritten. Use your configured database, or move the file yourself before local setup.",
      );
    if (docker(["volume", "inspect", local.volume], true).status === 0)
      throw new Error(
        "A previous local database volume exists. Restore its container and private configuration; no data was overwritten.",
      );

    const password = randomBytes(32).toString("hex");
    const temporary = mkdtempSync(join(tmpdir(), "oclr-local-db-"));
    const envFile = join(temporary, "postgres.env");
    try {
      writeFileSync(
        envFile,
        `POSTGRES_USER=${local.user}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${local.name}\n`,
        { mode: 0o600 },
      );
      docker([
        "run",
        "--detach",
        "--name",
        local.container,
        "--label",
        `org.oclr.local-database=${local.label}`,
        "--publish",
        `127.0.0.1:${local.port}:5432`,
        "--env-file",
        envFile,
        "--mount",
        `type=volume,source=${local.volume},target=/var/lib/postgresql/data`,
        "postgres:17",
      ]);
      const url = `postgresql://${local.user}:${password}@127.0.0.1:${local.port}/${local.name}?sslmode=disable`;
      writeFileSync(".env.local", developmentEnvironment(url), {
        mode: 0o600,
        flag: "wx",
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    if (
      docker(
        [
          "exec",
          local.container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          local.user,
          "-d",
          local.name,
        ],
        true,
      ).status === 0
    ) {
      console.log(
        `Local PostgreSQL is ready on 127.0.0.1:${local.port} (${local.name}).`,
      );
      console.log(
        "Database files live in a Docker volume outside this checkout. Private configuration stays in ignored .env.local.",
      );
      console.log("Next: npm run db:migrate && npm run db:seed:dev");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    "Local PostgreSQL did not become ready. Check the dedicated container logs.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Local database setup failed.",
  );
  process.exitCode = 1;
});
