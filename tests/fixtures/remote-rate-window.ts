import { readFileSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/** One worker uses the real backend quotas; separate large browser workloads by their read window. */
export async function waitForRemoteRateWindow(page: Page) {
  const attemptLog = process.env.OCLR_TEST_NO_DB_ATTEMPTS;
  if (!attemptLog) throw new Error("Remote acceptance harness is required.");
  const path = attemptLog + ".read-window";
  let previous = 0;
  try {
    previous = Number(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  const remaining = previous + 61_000 - Date.now();
  if (remaining > 0) await page.waitForTimeout(remaining);
  writeFileSync(path, String(Date.now()), { mode: 0o600 });
}
