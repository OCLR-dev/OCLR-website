// Run against tests/components/server.ts on an isolated loopback port.
// This captures design review evidence, not a new E2E regression matrix.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("docs/verification/issue-858");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
const base = process.env.S11_PREVIEW_URL ?? "http://127.0.0.1:31458";
try {
  for (const [size, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    for (const mode of ["light", "dark"]) {
      for (const appearance of ["default", "nebula-bloom"]) {
        const context = await browser.newContext({
          viewport,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("https://assets.ppy.sh/**", (route) =>
          route.fulfill({ status: 404, body: "" }),
        );
        await page.goto(
          `${base}/nebula-preview?theme=${mode}&appearance=${appearance}&locale=zh-Hant`,
        );
        await page.locator(".map-browse-card").first().waitFor();
        if (appearance === "nebula-bloom")
          await page.evaluate(async () => {
            const image = new Image();
            image.src = "/branding/home-hero/nebula-v2-1600.webp";
            await image.decode();
          });
        const prefix = `${output}/${size}-${mode}-${appearance}`;
        await page.screenshot({ path: `${prefix}.png`, fullPage: true });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        const bannerBackground = await page
          .locator(".page-heading")
          .evaluate((element) => getComputedStyle(element).backgroundImage);
        const posterCount = await page.locator(".event-artwork").count();
        if (
          posterCount ||
          (appearance === "nebula-bloom" &&
            !bannerBackground.includes("nebula-v2-1600.webp"))
        )
          throw new Error(
            "Mappool banner must use the nebula background without a key-visual poster.",
          );
        await page.locator(".map-open-button").first().click();
        await page.getByRole("dialog").waitFor();
        const dialogAudit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        if (appearance === "nebula-bloom")
          await page.screenshot({ path: `${prefix}-dialog.png` });
        await page.keyboard.press("Escape");
        const focusRestored = await page
          .locator(".map-open-button")
          .first()
          .evaluate((el) => el === document.activeElement);
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        results.push({
          size,
          mode,
          appearance,
          overflow,
          bannerBackground,
          posterCount,
          focusRestored,
          dialogViolations: dialogAudit.violations.map((v) => v.id),
          errors,
          violations: audit.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
        });
        console.log(
          size,
          mode,
          appearance,
          "overflow:",
          overflow,
          "axe:",
          audit.violations.map((v) => v.id).join(","),
        );
        await context.close();
      }
    }
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  for (const [locale, label] of [
    ["en", "S11 · Nebula Bloom"],
    ["zh-Hans", "S11 · 星云初绽"],
    ["zh-Hant", "S11 · 星雲初綻"],
  ]) {
    await page.goto(
      `${base}/nebula-preview?view=timeline&theme=dark&appearance=default&locale=${locale}`,
    );
    const s11 = page.locator('[data-tl-key="season-11"]');
    await s11.focus();
    await page.getByRole("note").waitFor();
    const text = await page.getByRole("note").innerText();
    if (!text.startsWith(label))
      throw new Error(`Incorrect ${locale} season name: ${text}`);
    await page.screenshot({ path: `${output}/timeline-${locale}.png` });
    results.push({
      locale,
      viewerAppearance: "default",
      title: text,
      href: await s11.getAttribute("href"),
    });
  }
  for (const [size, viewport, theme] of [
    ["desktop", { width: 1440, height: 1000 }, "light"],
    ["mobile", { width: 390, height: 844 }, "dark"],
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(
      `${base}/tournament-settings?theme=${theme}&appearance=nebula-bloom&locale=zh-Hant`,
    );
    const select = page
      .locator("select")
      .filter({ has: page.locator('option[value="nebula-bloom"]') });
    await select.selectOption("nebula-bloom");
    await page.screenshot({
      path: `${output}/settings-${size}-${theme}.png`,
      fullPage: true,
    });
    results.push({
      surface: "edition settings",
      size,
      theme,
      value: await select.inputValue(),
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    });
  }
  await page.goto(
    `${base}/nebula-preview?theme=dark&appearance=nebula-bloom&locale=en`,
  );
  await page.locator(".page-heading").waitFor();
  const reducedMotion = await page
    .locator(".page-heading")
    .evaluate((el) => getComputedStyle(el).animationName);
  await page.emulateMedia({ forcedColors: "active" });
  const forcedBackground = await page
    .locator(".page-heading")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  await page.screenshot({ path: `${output}/forced-colors-mobile.png` });
  results.push({ reducedMotion, forcedBackground });
  await context.close();
  await writeFile(
    `${output}/browser-results.json`,
    `${JSON.stringify(results, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
