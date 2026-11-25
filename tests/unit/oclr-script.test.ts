import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
const script = fileURLToPath(new URL("../../scripts/oclr.sh", import.meta.url));
const sha = "6".repeat(40);

function worker(
  action: string,
  password = "synthetic@raw:%/#?&+ space'ü",
  username = "",
  configuration = "",
) {
  const root = mkdtempSync(join(tmpdir(), "oclr-simple-shell-"));
  try {
    const bin = join(root, "bin"),
      repo = join(root, "repository"),
      envFile = join(root, "runtime.env");
    mkdirSync(bin);
    mkdirSync(join(repo, "scripts"), { recursive: true });
    copyFileSync(script, join(repo, "scripts/oclr.sh"));
    writeFileSync(
      envFile,
      `DATABASE_URL='postgresql://runtime:fixture_password@10.10.0.5:5432/oclr?sslmode=disable'\nAPP_URL='https://oclr.example.test'\n${configuration}`,
      { mode: 0o600 },
    );
    writeFileSync(join(bin, "id"), '#!/bin/bash\nprintf "oclr\\n"\n', {
      mode: 0o700,
    });
    writeFileSync(
      join(bin, "node"),
      `#!${process.execPath}\nconst cp=require('child_process'); const r=cp.spawnSync(${JSON.stringify(process.execPath)}, process.argv.slice(2),{stdio:'inherit',env:process.env});process.exit(r.status);\n`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(bin, "psql"),
      `#!${process.execPath}
const e=process.env;
if (e.PGHOST !== '10.10.0.5' || e.PGDATABASE !== 'oclr' || e.PGUSER !== 'runtime' || e.PGPASSWORD !== 'fixture_password' || e.PGSSLMODE !== 'disable' || process.argv.some(x=>x.includes('fixture_password'))) process.exit(8);
console.log('170007');
`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(repo, "scripts/update.sh"),
      `#!/bin/bash
node --input-type=module - "$@" <<'NODE'
import { writeFileSync } from 'node:fs';
const url = new URL(process.env.MIGRATION_DATABASE_URL);
writeFileSync('observed.json', JSON.stringify({ args:process.argv.slice(2), actor:decodeURIComponent(url.username), decoded:decodeURIComponent(url.password), host:process.env.OCLR_EXPECTED_DB_HOST, database:process.env.OCLR_EXPECTED_DB_NAME, environment:process.env.OCLR_ENVIRONMENT, rawExported:'OCLR_PROMPT_PASSWORD' in process.env, runtimeUnchanged:process.env.DATABASE_URL.includes('runtime:fixture_password') }));
NODE
`,
    );
    const result = spawnSync(
      "/bin/bash",
      [join(repo, "scripts/oclr.sh"), "--worker", action, root, envFile, sha],
      {
        encoding: "utf8",
        input: `${username}\n${password}\n`,
        timeout: 5000,
        env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
      },
    );
    const observed = existsSync(join(repo, "observed.json"))
      ? JSON.parse(readFileSync(join(repo, "observed.json"), "utf8"))
      : null;
    return { result, observed };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("simple deploy/update shell entry point", () => {
  it.each(["deploy", "update", "install-command"])(
    "previews %s without dependencies, privileges or configuration reads",
    (action) => {
      const result = spawnSync("/bin/bash", [script, action, "--dry-run"], {
        encoding: "utf8",
        env: { NODE_ENV: "test", PATH: "/nonexistent" },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("no commands or files changed");
    },
  );
  it.each(["deploy", "update"])(
    "loads settings, derives the target, and passes a pinned %s with privately encoded password to the existing engine",
    (action) => {
      const run = worker(action);
      expect(run.result.status, run.result.stderr).toBe(0);
      expect(run.observed).toEqual({
        args: [
          "--ref",
          sha,
          "--apply",
          ...(action === "deploy" ? ["--initial"] : []),
        ],
        actor: "oclr_migrator",
        decoded: "synthetic@raw:%/#?&+ space'ü",
        host: "10.10.0.5",
        database: "oclr",
        environment: "production",
        rawExported: false,
        runtimeUnchanged: true,
      });
      expect(run.result.stdout + run.result.stderr).not.toContain(
        "synthetic@raw",
      );
      expect(run.result.stdout + run.result.stderr).not.toContain(
        "fixture_password",
      );
    },
  );
  it("accepts the actual migration username instead of requiring a URL", () => {
    expect(
      worker("update", "fixture-only", "another_migrator").observed.actor,
    ).toBe("another_migrator");
  });
  it("retains explicitly configured expected targets for independent verification", () => {
    expect(
      worker(
        "update",
        "fixture-only",
        "",
        "OCLR_EXPECTED_DB_HOST='expected.internal'\n",
      ).observed.host,
    ).toBe("expected.internal");
  });
  it("queries the existing DB version using a password environment, without migration credentials", () => {
    const run = worker("version");
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.result.stdout.trim()).toBe("17");
    expect(run.observed).toBeNull();
  });
  it("rejects invalid settings and migration secrets in the runtime service file", () => {
    expect(
      worker("update", "fixture-only", "", "DATABASE_URL='invalid'\n").result
        .status,
    ).toBe(1);
    const run = worker(
      "update",
      "fixture-only",
      "",
      "MIGRATION_DATABASE_URL='do-not-load-with-service'\n",
    );
    expect(run.result.status).toBe(1);
    expect(run.observed).toBeNull();
  });
  it("stops on missing migration credentials before invoking deployment", () => {
    const run = worker("deploy", "");
    expect(run.result.status).toBe(1);
    expect(run.observed).toBeNull();
  });
});

describe("Liru slash command registration", () => {
  function registerBot(tokenSetting: string, input = "") {
    const root = mkdtempSync(join(tmpdir(), "oclr-liru-register-"));
    const bin = join(root, "bin");
    const release = join(root, "current");
    const envFile = join(root, "liru-bot.env");
    try {
      mkdirSync(bin);
      mkdirSync(join(release, "scripts"), { recursive: true });
      writeFileSync(join(release, "scripts/liru-discord-bot.ts"), "");
      writeFileSync(
        envFile,
        `LIRU_DISCORD_APPLICATION_ID="123456789012345678"\nLIRU_DISCORD_GUILD_ID='234567890123456789'\nUNRELATED=\$(touch marker)\n${tokenSetting}\n`,
        { mode: 0o600 },
      );
      writeFileSync(
        join(bin, "runuser"),
        `#!${process.execPath}
const { env, argv } = process;
if (argv.slice(2).join(' ') !== '--pty -u oclr -- npm run bot:liru:register') process.exit(2);
if (require('node:path').basename(process.cwd()) !== 'current') process.exit(3);
if (env.LIRU_DISCORD_APPLICATION_ID !== '123456789012345678' || env.LIRU_DISCORD_GUILD_ID !== '234567890123456789') process.exit(4);
if (env.LIRU_DISCORD_BOT_TOKEN !== 'synthetic.token' || env.UNRELATED || env.INHERITED_SECRET) process.exit(5);
console.log('Registered test command.');
`,
        { mode: 0o700 },
      );
      const result = spawnSync(
        "/bin/bash",
        [
          "-c",
          'source "$1"; id() { printf "1001\\n"; }; register_liru_bot "$2" "$3"',
          "test",
          script,
          envFile,
          release,
        ],
        {
          cwd: root,
          input,
          encoding: "utf8",
          env: {
            PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
            NODE_ENV: "test",
            INHERITED_SECRET: "excluded",
          },
        },
      );
      expect(existsSync(join(root, "marker"))).toBe(false);
      return result;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it.each([
    [
      "reads a configured token without prompting",
      'LIRU_DISCORD_BOT_TOKEN="synthetic.token"',
      "",
    ],
    [
      "reads the token from standard input when missing from the file",
      "",
      "synthetic.token\n",
    ],
  ])("%s", (_label, tokenSetting, input) => {
    const result = registerBot(tokenSetting, input);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Registered test command.");
    expect(result.stdout + result.stderr).not.toContain("synthetic.token");
  });

  it("stops before registration when the token is unavailable", () => {
    const result = registerBot("");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("A Discord Bot Token is required.");
    expect(result.stdout).not.toContain("Registered test command.");
  });
});

describe("privileged service provisioning", () => {
  function commandInstall(existing = "", failureAfterInstall = false) {
    const root = mkdtempSync(join(tmpdir(), "oclr-command-"));
    const command = join(root, "bin/oclr"),
      legacy = join(root, "sbin/oclr");
    try {
      mkdirSync(join(root, "sbin"));
      if (existing === "linked") symlinkSync(script, legacy);
      else if (existing) writeFileSync(legacy, existing);
      const result = spawnSync(
        "/bin/bash",
        [
          "-c",
          `
source "$1"
install() {
  local args=()
  while [[ $# -gt 0 ]]; do case "$1" in -o|-g) shift 2 ;; *) args+=("$1"); shift ;; esac; done
  /usr/bin/install "\${args[@]}"
}
install_command "$1" "$2" "$3"
[[ "$4" != fail ]]
`,
          "test",
          script,
          command,
          legacy,
          failureAfterInstall ? "fail" : "ok",
        ],
        { encoding: "utf8" },
      );
      return {
        result,
        command: existsSync(command) ? readFileSync(command, "utf8") : "",
        legacy: existsSync(legacy) ? readFileSync(legacy, "utf8") : "",
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  it("installs a usable command that survives subsequent deployment failure", () => {
    const run = commandInstall("", true);
    expect(run.result.status).toBe(1);
    expect(run.command).toBe(readFileSync(script, "utf8"));
    expect(run.legacy).toBe("");
  });
  it("refreshes a previously managed legacy command from the trusted invocation", () => {
    const run = commandInstall(
      "# Rocky Linux 10 convenience entry point\n# old installer\n",
    );
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.command).toBe(readFileSync(script, "utf8"));
    expect(run.legacy).toBe(run.command);
  });
  it.each(["unrelated local command", "linked"])(
    "preserves a conflicting %s before installing either shortcut",
    (existing) => {
      const run = commandInstall(existing);
      expect(run.result.status).toBe(1);
      expect(run.command).toBe("");
      expect(run.result.stderr).toContain("unrelated oclr command");
    },
  );
  it("isolates the app terminal, normalizes captured output and propagates worker failure", () => {
    for (const status of [0, 19]) {
      const result = spawnSync(
        "/bin/bash",
        [
          "-c",
          `
source "$1"
oclr_home=/var/lib/oclr
runuser() {
  [[ "$1" == --pty ]] || return 22
  printf '17\\r\\n'
  return "$SIMULATED_STATUS"
}
capture_oclr echo ignored
`,
          "test",
          script,
        ],
        {
          encoding: "utf8",
          env: { ...process.env, SIMULATED_STATUS: String(status) },
        },
      );
      expect(result.status).toBe(status);
      expect(result.stdout).toBe(status === 0 ? "17" : "");
      if (status !== 0) expect(result.stderr).toBe("17\n");
    }
  });
  function configure(
    existingUnit = "",
    existingPolicy = "",
    invalidPolicy = false,
    existingBot = "",
  ) {
    const root = mkdtempSync(join(tmpdir(), "oclr-unit-policy-"));
    try {
      const unit = join(root, "oclr.service"),
        policy = join(root, "oclr-site"),
        bot = join(root, "oclr-liru-bot.service"),
        log = join(root, "systemctl.log");
      if (existingUnit) writeFileSync(unit, existingUnit);
      if (existingPolicy) writeFileSync(policy, existingPolicy);
      if (existingBot) writeFileSync(bot, existingBot);
      const result = spawnSync(
        "/bin/bash",
        [
          "-c",
          `
source "$1"
service_file="$2"
sudoers_file="$3"
invalid_policy="$4"
systemctl_log="$5"
install() {
  local args=()
  while [[ $# -gt 0 ]]; do case "$1" in -o|-g) shift 2 ;; *) args+=("$1"); shift ;; esac; done
  /usr/bin/install "\${args[@]}"
}
systemctl() { printf '%s\\n' "$*" >> "$systemctl_log"; }
visudo() { [[ "$invalid_policy" != invalid ]]; }
configure_service
configure_service
`,
          "test",
          script,
          unit,
          policy,
          invalidPolicy ? "invalid" : "valid",
          log,
        ],
        { encoding: "utf8", env: { ...process.env } },
      );
      return {
        result,
        unit: existsSync(unit) ? readFileSync(unit, "utf8") : "",
        policy: existsSync(policy) ? readFileSync(policy, "utf8") : "",
        bot: existsSync(bot) ? readFileSync(bot, "utf8") : "",
        calls: existsSync(log)
          ? readFileSync(log, "utf8").trim().split("\n")
          : [],
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  it("installs the fixed unprivileged unit, matching the documented service, and only stop/start sudo rights", () => {
    const run = configure();
    expect(run.result.status, run.result.stderr).toBe(0);
    const documented = readFileSync(
      fileURLToPath(
        new URL("../../docs/examples/oclr.service", import.meta.url),
      ),
      "utf8",
    )
      .replace(/^#.*\n/gm, "")
      .trim();
    expect(run.unit.trim()).toBe(documented);
    expect(run.policy).toContain(
      "/usr/bin/systemctl stop oclr.service, /usr/bin/systemctl start oclr.service",
    );
    expect(run.policy).not.toContain("NOPASSWD: ALL");
  });
  it("installs and enables the release-managed Liru daemon only once", () => {
    const run = configure();
    expect(run.result.status, run.result.stderr).toBe(0);
    const documented = readFileSync(
      new URL("../../docs/examples/oclr-liru-bot.service", import.meta.url),
      "utf8",
    )
      .replace(/^#.*\n/gm, "")
      .trim();
    expect(run.bot.trim()).toBe(documented);
    expect(run.calls).toEqual([
      "daemon-reload",
      "enable oclr-liru-bot.service",
    ]);
    expect(run.policy).not.toContain("oclr-liru-bot.service");
  });

  it("retains an existing Liru unit and its enablement", () => {
    const run = configure("existing site unit", "", false, "local Liru unit");
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.bot).toBe("local Liru unit");
    expect(run.calls).toEqual([]);
  });

  it("refuses an invalid sudo policy without installing it", () => {
    const run = configure("existing local service", "", true);
    expect(run.result.status).toBe(1);
    expect(run.policy).toBe("");
    expect(run.unit).toBe("existing local service");
  });
  it("preserves existing service files and refuses to overwrite a different sudo policy", () => {
    const run = configure("existing local service", "existing private policy");
    expect(run.result.status).toBe(1);
    expect(run.unit).toBe("existing local service");
    expect(run.policy).toBe("existing private policy");
  });
});
