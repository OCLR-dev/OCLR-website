import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  editionState,
  registrations,
  registrationEvents,
} from "../../src/db/schema";
import { createSession } from "../../src/lib/auth/sessions";
import { seedSession } from "./session";
import { englishStorage } from "../fixtures/preferences";
const headers = { origin: "http://127.0.0.1:3100" };
test.describe("assisted registration from the edition workspace", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterAll(closeDb);
  test("verifies identities, records honest Pending/Accepted entries and supports deliberate late enrollment", async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    const admin = isMobile ? 70001 : 60001,
      base = isMobile ? 982001 : 981001;
    await context.addCookies([await seedSession(admin)]);
    await context.route("**/api/osu-images/avatar/*", (route) => route.abort());
    const url = "/api/admin/tournaments/test-cup/registrations";
    const anonymous = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      expect(
        (
          await anonymous.request.post(`${url}/preview`, {
            headers,
            data: { input: String(base) },
          })
        ).status(),
      ).toBe(401);
      expect(
        (await anonymous.request.post(url, { headers, data: {} })).status(),
      ).toBe(401);
      expect(
        (
          await context.request.post(`${url}/preview`, {
            data: { input: String(base) },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await context.request.post(`${url}/preview`, {
            headers,
            data: { input: "https://evil.test/users/123" },
          })
        ).status(),
      ).toBe(400);
      for (const [locale, add] of [
        ["en", "Add registrant"],
        ["zh-Hans", "添加报名选手"],
        ["zh-Hant", "新增報名選手"],
      ]) {
        await context.addCookies([
          { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto("/admin/tournaments/test-cup/registrations");
        const actions = page.locator(".registration-review-actions");
        await expect(actions.getByRole("button").first()).toHaveText(add);
        if (await actions.locator("a").count())
          await expect(actions.locator("a").last()).toHaveAttribute(
            "href",
            /export/,
          );
        expect(
          await actions.evaluate(
            (el) => el.getBoundingClientRect().right <= innerWidth,
          ),
        ).toBe(true);
        await page.getByRole("button", { name: add, exact: true }).click();
        await expect(page.getByRole("dialog")).toContainText(
          "Synthetic test edition",
        );
        const localizedDialog = page.getByRole("dialog");
        await localizedDialog.locator("input").first().fill(String(base));
        await localizedDialog
          .getByRole("button", {
            name:
              locale === "en"
                ? "Verify player"
                : locale === "zh-Hans"
                  ? "验证选手身份"
                  : "驗證選手身分",
            exact: true,
          })
          .click();
        await expect(localizedDialog).toContainText(
          `Synthetic Assisted ${base}`,
        );
        await localizedDialog.locator("select").last().selectOption("accepted");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        for (const width of isMobile ? [320, 390] : [768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
        await page.keyboard.press("Escape");
      }
      await context.addCookies([
        { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
      ]);
      await page.reload();
      async function preview(id: number) {
        await page
          .getByRole("button", { name: "Add registrant", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByLabel("osu! profile ID or URL")
          .fill(`https://osu.ppy.sh/users/${id}/osu`);
        await dialog
          .getByRole("button", { name: "Verify player", exact: true })
          .click();
        await expect(dialog).toContainText(`Synthetic Assisted ${id}`);
        return dialog;
      }
      let dialog = await preview(base);
      await expect(dialog.getByLabel("Initial status")).toHaveValue("pending");
      await expect(dialog).toContainText(
        "No player answers or acknowledgments are recorded.",
      );
      await dialog.getByLabel("osu! profile ID or URL").fill(String(base + 1));
      await expect(dialog.getByLabel("Initial status")).toHaveCount(0);
      await dialog
        .getByRole("button", { name: "Verify player", exact: true })
        .click();
      await expect(dialog).toContainText(`Synthetic Assisted ${base + 1}`);
      await page.keyboard.press("Escape");
      dialog = await preview(base);
      await dialog
        .getByRole("button", { name: "Add registrant", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(page).toHaveURL(new RegExp(`q=${base}$`));
      await expect(page.locator("tbody")).toContainText(
        `Synthetic Assisted ${base}`,
      );
      await expect(page.locator("tbody")).toContainText("pending");
      expect(
        (
          await anonymous.request.get(`/tournaments/test-cup/players?q=${base}`)
        ).status(),
      ).toBe(200);
      expect(
        await (
          await anonymous.request.get(`/tournaments/test-cup/players?q=${base}`)
        ).text(),
      ).not.toContain(`Synthetic Assisted ${base}`);
      dialog = await preview(base + 1);
      await dialog.getByLabel("Initial status").selectOption("accepted");
      await expect(
        dialog.getByRole("button", { name: "Add registrant", exact: true }),
      ).toBeDisabled();
      await dialog.getByRole("checkbox").check();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await dialog
        .getByRole("button", { name: "Add registrant", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      const publicPage = await anonymous.newPage();
      await publicPage.goto(`/tournaments/test-cup/players?q=${base + 1}`);
      await expect(publicPage.locator("main")).toContainText(
        `Synthetic Assisted ${base + 1}`,
      );
      const [acceptedRecord] = await db()
        .select()
        .from(registrations)
        .where(eq(registrations.userId, base + 1));
      expect(await publicPage.content()).not.toContain(acceptedRecord.id);
      const publicProfile = await anonymous.request.get(
        `/api/players/${base + 1}?edition=test-cup`,
      );
      expect(publicProfile.status()).toBe(200);
      const publicData = await publicProfile.json();
      expect(
        publicData.participation.every(
          (p: Record<string, unknown>) => !Object.hasOwn(p, "source"),
        ),
      ).toBe(true);
      expect(JSON.stringify(publicData)).not.toMatch(
        /"(?:answers|rulesVersion|configurationVersion|exceptionReason)":/,
      );
      const [state] = await db()
        .select()
        .from(editionState)
        .where(eq(editionState.slug, "test-cup"));
      const configured = state.configuration!;
      await db()
        .update(editionState)
        .set({
          configuration: {
            ...configured,
            registration: {
              ...configured.registration!,
              closesAt: "2025-02-01T00:00:00Z",
            },
          },
        })
        .where(eq(editionState.slug, "test-cup"));
      dialog = await preview(base + 2);
      await expect(dialog).toContainText("Registration-window exception");
      await expect(
        dialog.getByRole("button", { name: "Add registrant", exact: true }),
      ).toBeDisabled();
      await dialog.getByRole("checkbox").check();
      await dialog
        .getByLabel("Enrollment exception explanation")
        .fill("Synthetic approved late assistance");
      await dialog
        .getByRole("button", { name: "Add registrant", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      const rows = await db().select().from(registrations);
      expect(rows).toHaveLength(3);
      expect(
        rows.every(
          (r) =>
            r.source === "staff" &&
            r.rulesVersion === null &&
            r.eligibilityAcknowledged === null &&
            Object.keys(r.answers).length === 0,
        ),
      ).toBe(true);
      expect(
        (await db().select().from(registrationEvents)).some(
          (e) => e.reason === "Synthetic approved late assistance",
        ),
      ).toBe(true);
      const login = await createSession(base);
      await anonymous.addCookies([
        {
          name: "oclr_session",
          value: login.token,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await publicPage.goto("/dashboard");
      await expect(publicPage.locator(".registration-card")).toContainText(
        "Staff-assisted entry",
      );
      await db()
        .update(editionState)
        .set({ lockedAt: new Date() })
        .where(eq(editionState.slug, "test-cup"));
      expect(
        (
          await context.request.post(`${url}/preview`, {
            headers,
            data: { input: String(base) },
          })
        ).status(),
      ).toBe(409);
    } finally {
      await anonymous.close();
    }
  });
});
