import { sql } from "drizzle-orm";
import { assertTestDatabase } from "../database";
import { test, expect } from "@playwright/test";
import { db, closeDb } from "../../src/db";
import { chessBoards } from "../../src/db/schema";
import { seedSession } from "./session";
test.describe("OCL Chess saved canvas", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("persists confirmed pixels, synchronizes viewers and rejects early writes", async ({
    page,
    context,
    browser,
  }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE chess_players, chess_events`);
    const cookie = await seedSession(660001);
    await db()
      .insert(chessBoards)
      .values({ id: 1, pixels: "0".repeat(16384), enabled: true, revision: 0 })
      .onConflictDoUpdate({
        target: chessBoards.id,
        set: { pixels: "0".repeat(16384), enabled: true, revision: 0 },
      });
    await context.addCookies([cookie]);
    const viewer = await browser.newContext();
    try {
      await page.goto("/");
      const menu = page.locator(".menu-toggle");
      if (await menu.isVisible()) await menu.click();
      const entry = page
        .locator("#main-navigation")
        .getByRole("link", {
          name: "OCL Chess",
          exact: true,
          includeHidden: true,
        });
      await entry.click();
      await expect(page).toHaveURL(/\/games\/ocl-chess$/);
      await expect(entry).toHaveAttribute("aria-current", "page");
      if (await menu.isVisible())
        await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(
        page.getByRole("button", { name: "Confirm pixel" }),
      ).toBeEnabled();
      await page.getByLabel("X", { exact: true }).fill("12");
      await page.getByLabel("Y", { exact: true }).fill("10");
      await page.getByRole("button", { name: "Confirm pixel" }).click();
      await expect(
        page.getByRole("button", { name: "Confirm pixel" }),
      ).toBeDisabled();
      const state = await (
        await viewer.request.get("http://127.0.0.1:3100/api/games/ocl-chess")
      ).json();
      expect(state.pixels[10 * 128 + 12]).toBe("5");
      expect(state.signedIn).toBe(false);
      const request = { requestId: crypto.randomUUID(), x: 0, y: 0, color: 1 };
      expect(
        (
          await context.request.post("/api/games/ocl-chess", {
            headers: { Origin: "http://127.0.0.1:3100" },
            data: request,
          })
        ).status(),
      ).toBe(429);
      expect(
        (
          await viewer.request.post(
            "http://127.0.0.1:3100/api/games/ocl-chess",
            { headers: { Origin: "http://127.0.0.1:3100" }, data: request },
          )
        ).status(),
      ).toBe(401);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Confirm pixel" }),
      ).toBeDisabled();
    } finally {
      await viewer.close();
    }
  });
});
