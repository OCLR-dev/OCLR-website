import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";

const providers = [
  { name: "sip", key: "SIP_API_TOKEN", timeoutMs: 60 * 60_000 },
  { name: "otr", key: "OTR_API_KEY", timeoutMs: 120 * 60_000 },
  { name: "etx", key: null, timeoutMs: 30 * 60_000 },
] as const;
type Provider = (typeof providers)[number];

// All three refreshes share the former SIP slot: 12:00 Asia/Taipei.
export function dueRatingDay(now: Date) {
  return now.getUTCHours() >= 4 ? now.toISOString().slice(0, 10) : null;
}

export async function runDailyRatingRefresh({
  day,
  stateDir,
  env,
  run,
}: {
  day: string;
  stateDir: string;
  env: Readonly<Record<string, string | undefined>>;
  run: (provider: Provider) => Promise<boolean>;
}) {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  for (const provider of providers) {
    if (provider.key && !env[provider.key]?.trim()) continue;
    try {
      // Claim before contacting the provider. Another process or a restarted
      // daemon skips that provider for the same day, including failed runs.
      const claim = await open(
        join(stateDir, `${day}-${provider.name}`),
        "wx",
        0o600,
      );
      await claim.close();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST")
        continue;
      throw error;
    }
    console.log(`[ratings] ${provider.name} refresh started (${day} UTC).`);
    if (!(await run(provider).catch(() => false)))
      console.error(`[ratings] ${provider.name} refresh failed (${day} UTC).`);
  }
}

export function startRatingScheduler() {
  const stateDir =
    process.env.OCLR_RATING_STATE_DIR || "/var/lib/oclr/rating-refresh";
  let activeChild: ChildProcess | undefined;
  let completedDay: string | null = null;
  process.once("exit", () => activeChild?.kill("SIGTERM"));

  function run({ name, timeoutMs }: Provider) {
    return new Promise<boolean>((resolve) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", `scripts/refresh-${name}-ratings.ts`, "--apply"],
        {
          stdio: ["ignore", "inherit", "inherit"],
          timeout: timeoutMs,
          killSignal: "SIGKILL",
        },
      );
      activeChild = child;
      child.once("error", () => resolve(false));
      child.once("close", (code) => {
        if (activeChild === child) activeChild = undefined;
        resolve(code === 0);
      });
    });
  }

  async function tick() {
    const day = dueRatingDay(new Date());
    try {
      if (day && day !== completedDay) {
        await runDailyRatingRefresh({ day, stateDir, env: process.env, run });
        completedDay = day;
      }
    } catch {
      console.error(
        "[ratings] Could not record the daily refresh. Check the scheduler state directory.",
      );
    } finally {
      setTimeout(() => void tick(), 60_000).unref();
    }
  }

  // Let Next handle startup and signals as the systemd main process.
  setTimeout(() => void tick(), 30_000).unref();
}
