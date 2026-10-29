import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
try {
  const page = await context.newPage();
  await page.goto(new URL("../s1.html", import.meta.url).href);
  let switches = 0;
  for (const surface of ["", "schedule-", "mappools-", "admin-"])
    for (const size of ["desktop", "mobile"])
      for (const theme of ["light", "dark"])
        for (const version of ["", "current-"]) {
          for (const [name, value] of Object.entries({
            surface,
            size,
            theme,
            version,
          }))
            await page.locator(`[name="${name}"]`).selectOption(value);
          await page.locator("#preview").evaluate((n) => n.decode());
          switches++;
        }
  const cases = [];
  for (const width of [320, 390, 768, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("[name=theme]").selectOption(theme);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      cases.push({
        width,
        theme,
        violations: result.violations.map((x) => x.id),
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      });
    }
  await writeFile(
    new URL("gallery-verification.json", import.meta.url),
    JSON.stringify({ switches, cases }, null, 2) + "\n",
  );
  if (cases.some((c) => c.violations.length || c.overflow))
    throw new Error("Gallery validation failed");
  console.log({ switches, axeScans: cases.length });
} finally {
  await context.close();
  await browser.close();
}
