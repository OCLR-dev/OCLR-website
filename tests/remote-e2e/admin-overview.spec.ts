import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDb } from "../../src/db";
import { seedAdminOverview } from "../fixtures/admin-overview";
import { waitForRemoteRateWindow } from "../fixtures/remote-rate-window";

const backend = "http://127.0.0.1:3100",
  local = "http://127.0.0.1:31470";
test.afterAll(closeDb);
test("matches database overview filters and pagination through authorized saved reads", async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(180000);
  const { developer } = await seedAdminOverview();
  const backendContext = await browser.newContext({ baseURL: backend });
  await backendContext.addCookies([
    developer,
    { name: "oclr-locale", value: "en", url: backend },
  ]);
  try {
    const issued = await backendContext.request.post("/api/developer/tokens", {
      headers: { Origin: backend },
      data: {
        origin: local,
        scopes: [
          "identity:read",
          "tournaments:read",
          "tournaments:private:read",
          "profiles:read",
        ],
      },
    });
    expect(issued.status()).toBe(201);
    const { token } = await issued.json();
    await waitForRemoteRateWindow(page);
    await page.goto("/remote");
    await page.getByLabel("Developer token", { exact: true }).fill(token);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(
      page.getByText("Connected as Synthetic Player 397102", { exact: true }),
    ).toBeVisible();
    const section = page.locator("#accessible-tournaments");
    const cases = [
      "",
      "tournamentPage=2",
      "tournamentPage=9999",
      "tournamentQuery=Legacy&tournamentPage=2",
      "tournamentQuery=Legacy&tournamentStatus=completed",
      "tournamentQuery=NoSuchTournament",
    ];
    for (const query of cases) {
      const path = `/admin${query ? `?${query}` : ""}`;
      const nativePage = await backendContext.newPage();
      await nativePage.goto(backend + path);
      const native = nativePage.locator("#accessible-tournaments");
      const names = await native.locator("article h3").allTextContents();
      const count = await native.locator("p").first().textContent();
      await page.goto(path);
      await expect(section.locator("article h3")).toHaveText(names);
      await expect(section.locator("p").first()).toHaveText(count!);
      const nativeLinks = await native
        .locator("nav a")
        .evaluateAll((links) =>
          links.map((link) => (link as HTMLAnchorElement).getAttribute("href")),
        );
      expect(
        await section
          .locator("nav a")
          .evaluateAll((links) =>
            links.map((link) =>
              (link as HTMLAnchorElement).getAttribute("href"),
            ),
          ),
      ).toEqual(nativeLinks);
      await nativePage.close();
    }
    await page.goto("/admin?tournamentQuery=Legacy&tournamentPage=2");
    await section
      .getByLabel("Tournament status", { exact: true })
      .selectOption("live");
    await section.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(section.locator("article")).toHaveCount(6);
    expect(new URL(page.url()).searchParams.has("tournamentPage")).toBe(false);
    await section
      .getByRole("link", { name: "Clear filters", exact: true })
      .click();
    await expect(section.locator("article")).toHaveCount(12);
    await expect(
      page.getByRole("link", { name: "Create tournament", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await context.request.post("/api/admin/tournaments", {
          headers: { Origin: local },
          data: {
            slug: "forbidden-remote-overview",
            name: "Forbidden",
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(403);
    await page.screenshot({
      path: info.outputPath("remote-admin-overview.png"),
      fullPage: true,
    });
    expect(readFileSync(process.env.OCLR_TEST_NO_DB_ATTEMPTS!, "utf8")).toBe(
      "",
    );
  } finally {
    await backendContext.close();
  }
});
