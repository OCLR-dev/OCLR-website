import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

export function assertBrowserExecutables(
  executables: { name: string; path: string }[],
  exists: (path: string) => boolean = existsSync,
) {
  const missing = executables.filter((browser) => !exists(browser.path));
  if (missing.length)
    throw new Error(
      "CI image does not match the installed Playwright package: " +
        missing.map((browser) => browser.name).join(", ") +
        ". Update the pinned image together with package-lock.json.",
    );
}
export function selectBrowsers(names: string[]) {
  const engines = [chromium, firefox, webkit];
  if (names.some((name) => !engines.some((engine) => engine.name() === name)))
    throw new Error("Unknown CI browser engine");
  return names.length
    ? engines.filter((engine) => names.includes(engine.name()))
    : engines;
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const engines = selectBrowsers(process.argv.slice(2));
  assertBrowserExecutables(
    engines.map((browser) => ({
      name: browser.name(),
      path: browser.executablePath(),
    })),
  );
  // Presence alone cannot detect an incompatible container user/profile setup.
  for (const engine of engines) {
    const browser = await engine.launch();
    await browser.close();
  }
  console.log(
    "Pinned CI browsers are available and launch successfully; no download required.",
  );
}
