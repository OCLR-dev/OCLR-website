import { isAutomaticPreferenceCookie } from "../fixtures/preferences";
import { expect, test } from "@playwright/test";
import { seedEditions } from "../fixtures/editions";
import { closeDb } from "../../src/db";
// The core subset has a different preceding spec order. Own the published
// edition fixture instead of inheriting whatever another workflow left behind.
test.beforeEach(async () => {
  if (process.env.TEST_DATABASE_URL) await seedEditions();
});
test.afterAll(closeDb);
test("shared navigation works at desktop and mobile widths", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("OCLR — osu! Chinese League Rookie");
  if (isMobile)
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Information page" })
    .click();
  await expect(page).toHaveURL(/\/tournaments\/[^/]+$/);
  await expect(page.locator("#information-title")).toHaveText(/\S/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await expect(page.locator("footer button, footer nav")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Login with osu!", exact: true })
    .click();
  await page.getByRole("link", { name: "privacy notice", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
test("landing page has honest CTAs and readable original artwork", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".home-full-name")).toHaveText(
    "osu! Chinese League Rookie",
  );
  await expect(page.locator("#hero-title img")).toHaveAttribute(
    "alt",
    "OCLR S11",
  );
  await expect(page.locator(".home-information-link")).toHaveAttribute(
    "href",
    /\/tournaments/,
  );
  await page.goto("/");
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".home-information-link").click();
  await expect(page).toHaveURL(/\/tournaments(?:\/[a-z0-9-]+)?$/);
});
test("news is approved content only and about uses the official identity", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Organizers",
  );
  await expect(page.locator(".organizer-heading")).toContainText(
    "osu! Chinese League Rookie",
  );
  await expect(page.locator(".site-footer")).toContainText(
    "osu! Chinese League Rookie",
  );
  await page.goto("/news");
  if (process.env.TEST_DATABASE_URL) {
    await page
      .getByRole("link", { name: /Synthetic test announcement/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic fixture section" }),
    ).toBeVisible();
    await expect(page.getByText(/Plain text is escaped/)).toContainText(
      "<script>",
    );
    expect((await page.goto("/news/private-announcement"))?.status()).toBe(404);
  } else
    await expect(
      page.getByText("No announcements yet", { exact: true }),
    ).toBeVisible();
});

test("Privacy and About share one explicit osu! contact without publishing the admin allowlist", async ({
  page,
  context,
}, info) => {
  test.skip(
    !process.env.TEST_DATABASE_URL,
    "Requires synthetic contact configuration",
  );
  await page.goto("/privacy");
  const contact = page.getByRole("link", {
    name: "Contact OCLR Admin on osu!",
    exact: false,
  });
  await expect(contact).toHaveCount(1);
  await expect(contact).toHaveAttribute(
    "href",
    "https://osu.ppy.sh/users/60001",
  );
  await expect(
    page.getByRole("heading", { name: "Retention and requests" }),
  ).toHaveCount(0);
  await expect(contact).not.toHaveClass(/button/);
  await expect(
    page.getByText("the designated osu! contact", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("main details")).toHaveCount(0);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  const html = await page.content();
  for (const hidden of [
    "70001",
    "110001",
    "120001",
    "synthetic-browser-provider-secret",
    "private-contact@example.test",
  ])
    expect(html).not.toContain(hidden);
  expect(
    (await context.cookies()).filter(
      (cookie) => !isAutomaticPreferenceCookie(cookie),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("privacy-osu-contact.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/about");
  await expect(
    page.getByRole("link", {
      name: "Contact OCLR Admin on osu!",
      exact: false,
    }),
  ).toHaveAttribute("href", "https://osu.ppy.sh/users/60001");
});
