import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cases = [];
try {
  await page.goto(new URL("../s2.html", import.meta.url).href);
  for (const theme of ["light", "dark"])
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.selectOption("[name=theme]", theme);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      cases.push({
        theme,
        width,
        overflow,
        violations: result.violations.map((v) => v.id),
      });
      if (overflow || result.violations.length) errors.push({ theme, width });
    }
  let combinations = 0;
  for (const theme of ["light", "dark"])
    for (const size of ["desktop", "mobile"])
      for (const surface of ["", "schedule-", "mappools-", "admin-"])
        for (const version of ["", "current-"]) {
          for (const [key, value] of Object.entries({
            theme,
            size,
            surface,
            version,
          }))
            await page.selectOption(`[name=${key}]`, value);
          await page.locator("#preview").evaluate((n) => n.decode());
          combinations++;
        }
  await page.locator("[name=surface]").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  if (
    !(await page
      .locator("[name=size]")
      .evaluate((n) => n === document.activeElement))
  )
    errors.push("Keyboard focus order");
  await writeFile(
    new URL("gallery-verification.json", import.meta.url),
    JSON.stringify({ combinations, cases, errors }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ combinations, cases: cases.length, errors }));
} finally {
  await browser.close();
}
if (errors.length) process.exitCode = 1;
