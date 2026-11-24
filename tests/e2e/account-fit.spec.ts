import { test, expect } from "@playwright/test";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import prepared from "../../drizzle/legacy-editions.json" with { type: "json" };
import { seedSession } from "./session";

test.describe("content-fitting account menu", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("fits English and Chinese links on Home and tournament pages", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(120000);
    await seedEditions(
      prepared.map((item) => ({
        ...item,
        published: true,
        status: item.slug === "s11" ? "live" : item.status,
      })),
    );
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await context.route("**/api/osu-images/avatar/*", (route) => route.abort());
    try {
      for (const width of isMobile ? [320, 390] : [1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
          await context.addCookies([
            {
              name: "oclr-locale",
              value: locale,
              url: "http://127.0.0.1:3100",
            },
          ]);
          for (const path of ["/", "/tournaments/s11"]) {
            for (const theme of ["light", "dark"]) {
              await context.addCookies([
                {
                  name: "oclr-theme",
                  value: theme,
                  url: "http://127.0.0.1:3100",
                },
              ]);
              await page.goto(path);
              const trigger = page.locator(".account-control");
              await trigger.click();
              const menu = page.locator(".account-dropdown");
              await expect(menu).toBeVisible();
              const box = (await menu.boundingBox())!;
              const anchor = (await trigger.boundingBox())!;
              expect(box.width).toBeLessThan(240);
              expect(box.x).toBeGreaterThanOrEqual(0);
              expect(box.x + box.width).toBeLessThanOrEqual(width);
              expect(box.x + box.width).toBeCloseTo(anchor.x + anchor.width, 1);
              expect(box.y - anchor.y - anchor.height).toBeGreaterThanOrEqual(
                6,
              );
              // Intrinsic content, not a fixed broad card: inset beyond the widest
              // label stays bounded even when the translated labels are shorter.
              const widest = await menu
                .locator("a span")
                .evaluateAll((labels) =>
                  Math.max(
                    ...labels.map(
                      (label) => label.getBoundingClientRect().width,
                    ),
                  ),
                );
              expect(box.width - widest).toBeLessThan(75);
              for (const row of await menu.getByRole("menuitem").all()) {
                expect(
                  (await row.boundingBox())!.height,
                ).toBeGreaterThanOrEqual(44);
                expect(
                  await row.evaluate(
                    (node) => node.scrollWidth <= node.clientWidth,
                  ),
                ).toBe(true);
              }
              await page.keyboard.press("Escape");
              await expect(trigger).toBeFocused();
            }
          }
        }
      }
    } finally {
      await seedEditions(prepared);
    }
  });
});
