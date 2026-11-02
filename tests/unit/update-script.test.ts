import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  readlinkSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = fileURLToPath(new URL("../../scripts/", import.meta.url));
const old = "1".repeat(40),
  next = "2".repeat(40);
function rehearsal(failure = "", initial = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "oclr-update-test-")));
  const repo = join(root, "repository"),
    install = join(root, "install"),
    bin = join(root, "bin");
  const previous = join(install, "releases/previous"),
    archive = join(root, "archive");
  for (const path of [
    bin,
    join(repo, "scripts"),
    previous,
    join(archive, "scripts"),
  ])
    mkdirSync(path, { recursive: true });
  for (const file of ["update.sh", "production.sh", "backup-release-access.sh"])
    copyFileSync(join(source, file), join(repo, "scripts", file));
  copyFileSync(
    join(source, "production.sh"),
    join(archive, "scripts/production.sh"),
  );
  writeFileSync(
    join(archive, "scripts/deployment-db.ts"),
    "// mocked database transport in this orchestration test\n",
  );
  if (failure !== "legacy") writeFileSync(join(previous, ".oclr-release"), old);
  writeFileSync(join(previous, "retained"), old);
  if (!initial) symlinkSync(previous, join(install, "current"));
  writeFileSync(join(root, "active"), initial ? "no" : "yes");
  writeFileSync(join(root, "commands"), "");
  // Commands replace external systems only. The actual Bash updater owns sequencing,
  // activation and failure cleanup, including real temporary directories/symlinks.
  const mock = `#!${process.execPath}
const fs = require('fs'), cp = require('child_process');
const path = require('path');
const name = path.basename(process.argv[1]), a = process.argv.slice(2), env = process.env;
const root = env.REHEARSAL_ROOT, fail = env.REHEARSAL_FAILURE;
const log = line => fs.appendFileSync(root+'/commands', line+'\\n');
if (name === 'git') {
 const args = a.slice(2), op = args[0];
 if (op === 'status') { if (fail === 'dirty') console.log(' M user-file'); }
 else if (op === 'archive') { const r=cp.spawnSync('/usr/bin/tar',['-c','-C',root+'/archive','.']); process.stdout.write(r.stdout); process.exit(r.status); }
 else if (op === 'diff') process.exit(0);
 else if (op === 'rev-parse') console.log('1111111111111111111111111111111111111111');
 else log('git '+args.join(' '));
} else if (name === 'node') {
 if (a[0] === '--version') console.log(process.version);
 else if (a[2] === 'scripts/check-schema-migration.ts') {
  log('schema check migration='+Boolean(env.MIGRATION_DATABASE_URL));
  if (fail === 'schema') process.exit(7);
 }
 else {
  const mode = a[3];
  log('db '+mode+' migration='+Boolean(env.MIGRATION_DATABASE_URL));
  if (mode === 'apply' && fail !== 'backup') fs.writeFileSync(a[4]+'/migration.started','test-migration');
  if (mode === 'apply' && fail === 'interrupt') { process.kill(process.ppid, 'SIGTERM'); setInterval(() => {}, 1000); }
  if ((mode === 'inspect' && fail === 'inspect') || (mode === 'apply' && ['backup','migration'].includes(fail)) || (mode === 'health' && fail === 'health')) process.exit(7);
 }
} else if (name === 'npm') {
 log('npm '+a.join(' ')+' migration='+Boolean(env.MIGRATION_DATABASE_URL));
 if ((a.join(' ') === 'run build' && fail === 'build') || (a.join(' ') === 'run release:check' && fail === 'preflight')) process.exit(7);
} else if (name === 'systemctl') {
 if (a[0] === 'show') console.log(a[1].includes('User') ? cp.execFileSync('/usr/bin/id',['-un'],{encoding:'utf8'}).trim() : root+'/install/current');
 else if (a[0] === 'is-active') process.exit(fs.readFileSync(root+'/active','utf8') === 'yes' ? 0 : 3);
 else { log('service '+a[0]); fs.writeFileSync(root+'/active',a[0]==='start'?'yes':'no'); if (a[0] === 'start' && fail === 'start') process.exit(7); }
} else if (name === 'sudo') {
 if (a.includes('-l')) process.exit(0);
 const r=cp.spawnSync(a[1],a.slice(2),{stdio:'inherit',env}); process.exit(r.status);
} else if (name === 'id') {
 if (a.join(' ') === '-u oclr-backup') { if (env.REHEARSAL_BACKUP === '1') console.log('99998'); else process.exit(1); }
 else { const r=cp.spawnSync('/usr/bin/id',a,{stdio:'inherit'}); process.exit(r.status); }
} else if (name === 'setfacl') {
 log('acl '+(a.at(-1).endsWith('/.oclr-release') ? 'marker' : 'directories')+' active='+fs.readFileSync(root+'/active','utf8'));
 if (fail === 'acl') process.exit(7);
} else if (name === 'stat') console.log(process.getuid());
else if (name === 'readlink') console.log(fs.realpathSync(a.at(-1)));
else if (name === 'mv') fs.renameSync(a.at(-2),a.at(-1));
else if (name === 'chmod') fs.chmodSync(a.at(-1), 0o700);
else if (name === 'ln') fs.symlinkSync(a.at(-2), a.at(-1));
else if (name === 'flock') process.exit(fail === 'lock' ? 1 : 0);
else throw new Error('Unexpected external backup command');
`;
  for (const name of [
    "git",
    "id",
    "setfacl",
    "node",
    "npm",
    "systemctl",
    "sudo",
    "stat",
    "readlink",
    "mv",
    "flock",
    "pg_dump",
    "pg_restore",
    "chmod",
    "ln",
  ])
    writeFileSync(join(bin, name), mock, { mode: 0o700 });
  try {
    const result = spawnSync(
      "/bin/bash",
      [
        join(repo, "scripts/update.sh"),
        "--ref",
        ["same", "legacy"].includes(failure) ? old : next,
        "--apply",
        ...(initial ? ["--initial"] : []),
      ],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          PATH: `${bin}:/usr/bin:/bin`,
          REHEARSAL_ROOT: root,
          REHEARSAL_FAILURE: failure,
          REHEARSAL_BACKUP: ["operator", "acl", "same"].includes(failure)
            ? "1"
            : "0",
          OCLR_INSTALL_DIR: install,
          OCLR_BACKUP_DIR: join(root, "backups"),
          OCLR_ENVIRONMENT: "staging",
          OCLR_EXPECTED_DB_HOST: "db.invalid",
          OCLR_EXPECTED_DB_NAME: "oclr_test",
          DATABASE_URL: "postgres://runtime@db.invalid/oclr_test",
          MIGRATION_DATABASE_URL:
            "postgres://must-not-be-logged@db.invalid/oclr_test",
          APP_URL: "https://oclr.example.test",
        },
      },
    );
    return {
      result,
      calls: readFileSync(join(root, "commands"), "utf8").trim().split("\n"),
      active: readFileSync(join(root, "active"), "utf8"),
      switched:
        existsSync(join(install, "current")) &&
        readlinkSync(join(install, "current")) !== previous,
      previousLink: existsSync(join(install, "previous")),
      oldPreserved: readFileSync(join(previous, "retained"), "utf8") === old,
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}
describe("Bash site updates", () => {
  it("previews a pinned update without commands, dependencies or credentials", () => {
    const result = spawnSync(
      "/bin/bash",
      [join(source, "update.sh"), "--ref", next, "--dry-run"],
      {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: "/nonexistent",
          MIGRATION_DATABASE_URL: "secret-url",
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(next);
    expect(result.stdout).not.toContain("secret-url");
    expect(
      spawnSync("/bin/bash", [
        join(source, "update.sh"),
        "--ref",
        "main",
        "--apply",
      ]).status,
    ).toBe(1);
  });
  it("builds separately, stops writes before backup/migration, activates and checks health", () => {
    const run = rehearsal();
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.active).toBe("yes");
    expect(run.switched).toBe(true);
    expect(run.oldPreserved).toBe(true);
    const calls = run.calls;
    expect(calls.indexOf("npm run build migration=false")).toBeLessThan(
      calls.indexOf("schema check migration=false"),
    );
    expect(calls.indexOf("schema check migration=false")).toBeLessThan(
      calls.indexOf("db inspect migration=true"),
    );
    expect(calls.indexOf("schema check migration=false")).toBeLessThan(
      calls.indexOf("service stop"),
    );
    expect(calls.indexOf("service stop")).toBeLessThan(
      calls.indexOf("db apply migration=true"),
    );
    expect(calls.indexOf("npm run release:check migration=false")).toBeLessThan(
      calls.indexOf("service start"),
    );
    expect(calls.at(-1)).toBe("db health migration=false");
    expect(run.result.stdout + run.result.stderr).not.toContain(
      "must-not-be-logged",
    );
  });
  it("installs a first release through the same backup/migration/health pipeline", () => {
    const run = rehearsal("", true);
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.active).toBe("yes");
    expect(run.switched).toBe(true);
    expect(run.previousLink).toBe(false);
    expect(run.calls).not.toContain("schema check migration=false");
    expect(run.calls).toContain("db apply migration=true");
    expect(run.calls.at(-1)).toBe("db health migration=false");
  });
  it("grants operator marker access on each new release before maintenance", () => {
    const run = rehearsal("operator");
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.calls).toContain("acl directories active=yes");
    expect(run.calls).toContain("acl marker active=yes");
    expect(run.calls.indexOf("acl marker active=yes")).toBeLessThan(
      run.calls.indexOf("service stop"),
    );
  });
  it("keeps the current website online if operator access cannot be granted", () => {
    const run = rehearsal("acl");
    expect(run.result.status).not.toBe(0);
    expect(run.active).toBe("yes");
    expect(run.switched).toBe(false);
    expect(run.calls).not.toContain("service stop");
  });
  it.each(["build", "backup", "migration", "health"])(
    "leaves an initial installation stopped after %s failure",
    (failure) => {
      const run = rehearsal(failure, true);
      expect(run.result.status).not.toBe(0);
      expect(run.active).toBe("no");
      expect(run.previousLink).toBe(false);
      if (["build", "backup"].includes(failure))
        expect(run.switched).toBe(false);
      if (failure === "backup")
        expect(run.calls).not.toContain("service start");
    },
  );
  it("converts a manually installed same-SHA release into a verified release without mutating its files", () => {
    const run = rehearsal("legacy");
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.switched).toBe(true);
    expect(run.oldPreserved).toBe(true);
    expect(run.calls).toContain("npm run build migration=false");
  });
  it("retries an already active SHA by checking health without migration or service changes", () => {
    const run = rehearsal("same");
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.active).toBe("yes");
    expect(run.switched).toBe(false);
    expect(run.calls).toContain("acl marker active=yes");
    expect(run.calls.filter((call) => call.startsWith("db "))).toEqual([
      "db health migration=false",
    ]);
    expect(
      run.calls.some(
        (call) => call.startsWith("npm ") || call.startsWith("service "),
      ),
    ).toBe(false);
  });
  it.each(["build", "schema", "inspect", "lock", "dirty"])(
    "leaves the existing release online when %s fails before maintenance",
    (failure) => {
      const run = rehearsal(failure);
      expect(run.result.status).not.toBe(0);
      expect(run.active).toBe("yes");
      expect(run.switched).toBe(false);
      expect(run.calls).not.toContain("service stop");
      if (failure === "schema") {
        expect(run.calls).not.toContain("db inspect migration=true");
        expect(run.calls).not.toContain("db apply migration=true");
        expect(run.result.stdout).toContain(
          "checking schema changes against committed migrations (exit 7)",
        );
      }
    },
  );
  it("restarts the unchanged release if backup fails before any migration", () => {
    const run = rehearsal("backup");
    expect(run.result.status).toBe(7);
    expect(run.active).toBe("yes");
    expect(run.switched).toBe(false);
    expect(run.calls).toContain("service start");
  });
  it.each(["migration", "preflight", "start", "health", "interrupt"])(
    "keeps service stopped and preserves the previous release after uncertain %s failure",
    (failure) => {
      const run = rehearsal(failure);
      expect(run.result.status).toBe(failure === "interrupt" ? 143 : 7);
      expect(run.active).toBe("no");
      expect(run.oldPreserved).toBe(true);
      expect(run.result.stdout).toContain("Service kept stopped");
      expect(run.result.stdout).toContain("Update failed during");
      expect(run.result.stdout).toContain("sudo journalctl -u oclr.service");
      if (failure === "health")
        expect(run.result.stdout).toContain(
          "verifying local and public release health (exit 7)",
        );
    },
  );
});

it("backs up configured durable media within the stopped-write boundary", () => {
  const script = readFileSync(join(source, "update.sh"), "utf8");
  const stop = script.indexOf(
    'stop "$service"',
    script.indexOf("Stopping writes"),
  );
  const media = script.indexOf('tar -cf "$backup_dir/team-media.tar"');
  const migrations = script.indexOf('run database apply "$backup_dir"');
  expect(stop).toBeGreaterThan(0);
  expect(media).toBeGreaterThan(stop);
  expect(migrations).toBeGreaterThan(media);
  expect(script).toContain("sha256sum team-media.tar");
});
