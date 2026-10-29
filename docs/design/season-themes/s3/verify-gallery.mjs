import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(new URL("../s3.html", import.meta.url).href);
  for (const width of [320, 390, 768, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.selectOption('[name="theme"]', theme);
      for (const surface of ["", "schedule-", "mappools-", "admin-"])
        for (const size of ["desktop", "mobile"])
          for (const version of ["", "current-"]) {
            await page.selectOption('[name="surface"]', surface);
            await page.selectOption('[name="size"]', size);
            await page.selectOption('[name="version"]', version);
            await page.locator("#preview").evaluate((n) => n.decode());
          }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        audit.violations.map((v) => v.id),
        [],
      );
      results.push({ width, theme, imagesDecoded: 16, axeViolations: 0 });
    }
  await page.locator('[name="surface"]').focus();
  assert(
    await page
      .locator('[name="surface"]')
      .evaluate((n) => n.matches(":focus-visible")),
  );
  await writeFile(
    new URL("gallery-verification.json", import.meta.url),
    JSON.stringify({ results, keyboardFocus: true }, null, 2) + "\n",
  );
  console.log("Gallery: 128 image selections, 8 Axe scans passed");
} finally {
  await browser.close();
}
