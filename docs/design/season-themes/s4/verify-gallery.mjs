import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [],
  scans = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(new URL("../s4.html", import.meta.url).href);
let choices = 0;
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
          await page.selectOption(
            `#gallery-form select[name="${name}"]`,
            value,
          );
        await page.locator("#preview").evaluate(async (image) => {
          await image.decode();
          if (!image.naturalWidth) throw new Error("Missing screenshot");
        });
        choices++;
      }
for (const width of [320, 390, 768, 1440])
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 844 });
    await page.selectOption('select[name="theme"]', theme);
    for (const panel of ["pages", "controls"]) {
      await page.locator(`#tab-${panel}`).click();
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      if (axe.violations.length) errors.push(axe.violations);
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        errors.push("overflow");
      scans.push({ width, theme, panel, axeViolations: axe.violations.length });
    }
    // Return to the page controls so its theme can be changed at the next width.
    await page.locator("#tab-pages").click();
  }
await page.locator("#tab-pages").focus();
await page.keyboard.press("ArrowRight");
if (
  !(await page
    .locator("#tab-controls")
    .evaluate((n) => n === document.activeElement))
)
  errors.push("tab focus");
await page.locator('button[type="submit"]').click();
if (
  (await page.locator("#sample-name").getAttribute("aria-invalid")) !== "true"
)
  errors.push("missing invalid state");
await page.locator("#sample-name").fill("Local preview");
await page.locator('button[type="submit"]').click();
if (
  !(await page.locator("#sample-result").innerText()).includes("Local preview")
)
  errors.push("preview failed");
await page.locator('button[type="reset"]').click();
if ((await page.locator("#sample-name").inputValue()) !== "")
  errors.push("reset failed");
if (!(await page.locator("#sample-error").isHidden()))
  errors.push("reset error");
await page.keyboard.press("Home");
await page.locator("#tab-controls").focus();
await page.keyboard.press("Home");
if (
  !(await page
    .locator("#tab-pages")
    .evaluate((n) => n === document.activeElement))
)
  errors.push("Home tab focus");
const report = {
  date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(
    new Date(),
  ),
  choices,
  scans,
  localForm: true,
  errors,
};
await writeFile(
  new URL("gallery-verification.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ choices, scans: scans.length, errors }));
await context.close();
await browser.close();
if (errors.length) process.exitCode = 1;
