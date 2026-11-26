import { it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
it("accepts the supported existing Node 22 runtime and rejects older or invalid versions", () => {
  const root = mkdtempSync(join(tmpdir(), "oclr-node-check-"));
  try {
    for (const [version, accepted] of [
      ["v22.23.2", true],
      ["v22.13.0", true],
      ["v24.22.2", true],
      ["v22.12.9", false],
      ["v20.19.0", false],
      ["invalid", false],
    ] as const) {
      const executable = join(root, "node");
      writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`, {
        mode: 0o700,
      });
      const result = spawnSync("/bin/bash", [
        "scripts/check-node-version.sh",
        executable,
      ]);
      expect(result.status === 0, version).toBe(accepted);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("previews installation without running host tools or touching configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "oclr-installer-"));
  const script = join(process.cwd(), "scripts/install-backup-operator.sh");
  try {
    expect(spawnSync("/bin/bash", ["-n", script]).status).toBe(0);
    const output = execFileSync(
      "/bin/bash",
      [script, "--ref", "a".repeat(40), "--dry-run"],
      { env: { PATH: root, NODE_ENV: "test" }, encoding: "utf8" },
    );
    expect(output).toContain("Do not start the service");
    expect(output).toContain("root-owned operator release");
    expect(
      spawnSync("/bin/bash", [script, "--ref", "main", "--apply"], {
        env: { PATH: root, NODE_ENV: "test" },
      }).status,
    ).not.toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([false, true])(
  "switches the full backup operator release and handles startup failure (failure=%s)",
  (failStartup) => {
    const root = mkdtempSync(join(tmpdir(), "oclr-operator-switch-"));
    const bin = join(root, "bin");
    const current = join(root, "current");
    const previous = join(root, "old");
    const release = join(root, "new");
    const unit = join(root, "oclr-backup.service");
    const override = join(root, "40-backup-worker.conf");
    const active = join(root, "active");
    const unitData = `[Service]\nWorkingDirectory=${previous}\nEnvironmentFile=/etc/oclr-backup/operator.env\n`;
    const overrideData = "[Service]\nBindReadOnlyPaths=/old/worker.ts\n";
    try {
      mkdirSync(bin);
      mkdirSync(previous);
      mkdirSync(release);
      symlinkSync(previous, current);
      writeFileSync(unit, unitData);
      writeFileSync(override, overrideData);
      writeFileSync(active, "");
      writeFileSync(
        join(bin, "systemctl"),
        `#!/bin/bash
case "$1" in
  is-active) test -f "$OCLR_TEST_ACTIVE" ;;
  stop) rm -f -- "$OCLR_TEST_ACTIVE" ;;
  daemon-reload) exit 0 ;;
  show) sed -n 's/^WorkingDirectory=//p' "$OCLR_TEST_UNIT" ;;
  start)
    if [[ $OCLR_TEST_FAIL == yes && $(readlink "$OCLR_TEST_CURRENT") == "$OCLR_TEST_RELEASE" ]]; then
      exit 1
    fi
    touch "$OCLR_TEST_ACTIVE"
    ;;
  *) exit 2 ;;
esac
`,
        { mode: 0o700 },
      );
      // Supply GNU mv -T semantics on macOS as well as Linux.
      writeFileSync(
        join(bin, "mv"),
        `#!/bin/sh
exec "$OCLR_TEST_NODE" -e 'require("node:fs").renameSync(process.argv.at(-2), process.argv.at(-1))' -- "$@"
`,
        { mode: 0o700 },
      );
      const result = spawnSync(
        "/bin/bash",
        [
          "-c",
          'set -euo pipefail; source scripts/backup-operator-switch.sh; switch_backup_operator_release "$@"',
          "fixture",
          release,
          current,
          unit,
          override,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            OCLR_TEST_ACTIVE: active,
            OCLR_TEST_UNIT: unit,
            OCLR_TEST_CURRENT: current,
            OCLR_TEST_RELEASE: release,
            OCLR_TEST_FAIL: failStartup ? "yes" : "no",
            OCLR_TEST_NODE: process.execPath,
          },
        },
      );
      expect(result.status, result.stderr).toBe(failStartup ? 1 : 0);
      expect(readlinkSync(current)).toBe(failStartup ? previous : release);
      expect(readFileSync(unit, "utf8")).toBe(
        failStartup ? unitData : unitData.replace(previous, current),
      );
      expect(existsSync(override)).toBe(failStartup);
      if (failStartup)
        expect(readFileSync(override, "utf8")).toBe(overrideData);
      expect(existsSync(active)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
it("hashes private media through the fixed helper and rejects symlink roots", () => {
  const root = mkdtempSync(join(tmpdir(), "oclr-media-"));
  try {
    writeFileSync(join(root, "private.bin"), "synthetic", { mode: 0o600 });
    const output = execFileSync(
      process.execPath,
      ["operator/media-fingerprint.mjs", root],
      { encoding: "utf8" },
    );
    expect(output.trim()).toMatch(/^[a-f0-9]{64}$/);
    writeFileSync(join(root, "private.bin"), "changed", { mode: 0o600 });
    expect(
      execFileSync(process.execPath, ["operator/media-fingerprint.mjs", root], {
        encoding: "utf8",
      }),
    ).not.toBe(output);
    symlinkSync(root, join(root, "linked"));
    expect(
      spawnSync(process.execPath, [
        "operator/media-fingerprint.mjs",
        join(root, "linked"),
      ]).status,
    ).not.toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
