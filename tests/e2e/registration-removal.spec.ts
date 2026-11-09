import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql, eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json" with { type: "json" };
import hans from "../../messages/zh-Hans.json" with { type: "json" };
import hant from "../../messages/zh-Hant.json" with { type: "json" };
import { appTranslator } from "../../src/i18n/translate";
import { db, closeDb } from "../../src/db";
import {
  registrations,
  registrationEvents,
  staffRoles,
  users,
} from "../../src/db/schema";
import { createSession } from "../../src/lib/auth/sessions";
import { prepareDraft } from "../fixtures/draft";
import { pickPlayer } from "../../src/lib/draft";
import { staffDraft } from "../../src/lib/draft-reads";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { seedSession } from "./session";
import { seedBrowserEditions } from "./setup";
import { englishStorage } from "../fixtures/preferences";

test.describe("safe staff registration removal", () => {
  test.skip(!process.env.TEST_DATABASE_URL);
  test.beforeAll(() => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ADMIN_OSU_IDS = "60001";
  });
  test.beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
  });
  test.afterEach(async () => {
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);
  test("confirms identity, withdraws active/public participation and explicitly restores Pending in all locales", async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
    test.setTimeout(90000);
    await context.addCookies([await seedSession(60001)]);
    const anonymous = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const playerContext = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      for (const [index, locale] of ["en", "zh-Hans", "zh-Hant"].entries()) {
        const catalog = { en, "zh-Hans": hans, "zh-Hant": hant }[locale]!;
        const translator = createTranslator({
          locale,
          messages: catalog.ui as Record<string, string>,
        });
        const tr = appTranslator(
          (key, values) => translator(key, values),
          locale,
        );
        const userId = 65001 + index;
        await db()
          .insert(users)
          .values({ osuId: userId, username: `Synthetic removal ${userId}` });
        const [r] = await db()
          .insert(registrations)
          .values({
            editionSlug: "test-cup",
            userId,
            status: index ? "accepted" : "pending",
            source: index ? "player" : "staff",
            answers: index ? { private: "PRIVATE_APPLICATION_107" } : {},
            rulesVersion: index ? "original-rules-v1" : null,
          })
          .returning();
        await seedEditions([{ ...edition, slug: "other-removal-test" }], false);
        await db().insert(registrations).values({
          editionSlug: "other-removal-test",
          userId,
          status: "accepted",
          answers: {},
        });
        const cookie = await createSession(userId);
        await playerContext.addCookies([
          {
            name: "oclr_session",
            value: cookie.token,
            domain: "127.0.0.1",
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        const endpoint = `/api/admin/tournaments/test-cup/registrations/${r.id}/remove`;
        const payload = {
          confirmed: true,
          expectedUpdatedAt: r.updatedAt.toISOString(),
        };
        expect(
          (
            await anonymous.request.post(endpoint, {
              headers: { origin: "http://127.0.0.1:3100" },
              data: payload,
            })
          ).status(),
        ).toBe(401);
        expect(
          (
            await playerContext.request.post(endpoint, {
              headers: { origin: "http://127.0.0.1:3100" },
              data: payload,
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await context.request.post(endpoint, {
              headers: { origin: "https://untrusted.example" },
              data: payload,
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await context.request.post(
              `/api/admin/tournaments/other-removal-test/registrations/${r.id}/remove`,
              { headers: { origin: "http://127.0.0.1:3100" }, data: payload },
            )
          ).status(),
        ).toBe(404);
        await context.addCookies([
          {
            name: "oclr-locale",
            value: locale,
            domain: "127.0.0.1",
            path: "/",
          },
          {
            name: "oclr-theme",
            value: index === 1 ? "dark" : "light",
            domain: "127.0.0.1",
            path: "/",
          },
        ]);
        await page.setViewportSize({
          width: isMobile ? 320 : 1440,
          height: 900,
        });
        await page.goto(`/admin/tournaments/test-cup/registrations/${r.id}`);
        await page
          .getByRole("button", { name: tr("Remove registration"), exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText(`Synthetic removal ${userId}`);
        await expect(dialog).toContainText(String(userId));
        await expect(dialog).toContainText(edition.name);
        await expect(dialog).toContainText(tr(r.status));
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await dialog
          .getByRole("button", { name: tr("Cancel"), exact: true })
          .click();
        expect(
          (
            await db()
              .select()
              .from(registrations)
              .where(eq(registrations.id, r.id))
          )[0].status,
        ).toBe(r.status);
        await page
          .getByRole("button", { name: tr("Remove registration"), exact: true })
          .click();
        await dialog
          .getByRole("button", { name: tr("Confirm"), exact: true })
          .click();
        await expect(
          page.getByRole("status").filter({
            hasText: tr(
              "Registration removed by staff. Its history is retained.",
            ),
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: tr("Remove registration"),
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("button", {
            name: tr("Restore for review"),
            exact: true,
          }),
        ).toBeVisible();
        const publicRows = await (
          await anonymous.request.get(
            `/api/tournaments/test-cup/players?q=${userId}`,
          )
        ).json();
        expect(publicRows.rows).toHaveLength(0);
        expect(
          (
            await (
              await anonymous.request.get(
                `/api/tournaments/other-removal-test/players?q=${userId}`,
              )
            ).json()
          ).rows,
        ).toHaveLength(1);
        const dashboard = await playerContext.newPage();
        await dashboard.goto("/dashboard");
        await expect(
          dashboard.getByText(
            "Staff withdrew this registration. Your application history is retained.",
            { exact: true },
          ),
        ).toBeVisible();
        await dashboard.close();
        expect(
          (
            await context.request.post(endpoint, {
              headers: { origin: "http://127.0.0.1:3100" },
              data: payload,
            })
          ).status(),
        ).toBe(409);
        await page
          .getByRole("link", { name: tr("View registrations"), exact: true })
          .click();
        await expect(page).toHaveURL(
          /\/admin\/tournaments\/test-cup\/registrations$/,
        );
        await expect(
          page.getByRole("cell", {
            name: `Synthetic removal ${userId}`,
            exact: true,
          }),
        ).toHaveCount(0);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page
          .locator('form.filters select[name="status"]')
          .selectOption("withdrawn");
        await page
          .getByRole("button", { name: tr("Filter"), exact: true })
          .click();
        await expect(
          page.getByRole("cell", {
            name: `Synthetic removal ${userId}`,
            exact: true,
          }),
        ).toBeVisible();
        await page.goto(`/admin/tournaments/test-cup/registrations/${r.id}`);
        await page
          .getByRole("button", { name: tr("Restore for review"), exact: true })
          .click();
        await dialog
          .getByRole("button", { name: tr("Confirm"), exact: true })
          .click();
        await expect(
          page.getByRole("status").filter({
            hasText: tr(
              "Registration restored for review. No new player acknowledgments were recorded.",
            ),
          }),
        ).toBeVisible();
        const [saved] = await db()
          .select()
          .from(registrations)
          .where(eq(registrations.id, r.id));
        expect(saved).toMatchObject({
          status: "pending",
          answers: r.answers,
          source: r.source,
          rulesVersion: r.rulesVersion,
        });
        expect(
          (
            await (
              await anonymous.request.get(
                `/api/tournaments/test-cup/players?q=${userId}`,
              )
            ).json()
          ).rows,
        ).toHaveLength(0);
      }
    } finally {
      await anonymous.close();
      await playerContext.close();
    }
  });
  test("blocks captains and live pool/picked players with actionable recovery links; enforces scoped roles", async ({
    page,
    context,
  }) => {
    await context.addCookies([await seedSession(60001)]);
    const slug = "protected-removal-test";
    const f = await prepareDraft(slug, 60001);
    for (const userId of [f.a.osuId, f.players[0].osuId]) {
      const [r] = await db()
        .select()
        .from(registrations)
        .where(
          sql`${registrations.editionSlug}=${slug} AND ${registrations.userId}=${userId}`,
        );
      await page.goto(`/admin/tournaments/${slug}/registrations/${r.id}`);
      await page
        .getByRole("button", { name: "Remove registration", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(
        dialog.getByRole("link", { name: "Live draft", exact: true }),
      ).toHaveAttribute("href", `/admin/tournaments/${slug}/draft`);
      expect(
        (
          await db()
            .select()
            .from(registrations)
            .where(eq(registrations.id, r.id))
        )[0].status,
      ).toBe("accepted");
    }
    const session = (await staffDraft(f.staff, slug)).session!;
    await pickPlayer(f.staff, slug, {
      sessionId: session.id,
      expectedVersion: session.version,
      turnIndex: session.turnIndex,
      candidateId: f.players[0].osuId,
      idempotencyKey: crypto.randomUUID(),
    });
    const [picked] = await db()
      .select()
      .from(registrations)
      .where(
        sql`${registrations.editionSlug}=${slug} AND ${registrations.userId}=${f.players[0].osuId}`,
      );
    const endpoint = `/api/admin/tournaments/${slug}/registrations/${picked.id}/remove`;
    const payload = {
      confirmed: true,
      expectedUpdatedAt: picked.updatedAt.toISOString(),
    };
    expect(
      (
        await context.request.post(endpoint, {
          headers: { origin: "http://127.0.0.1:3100" },
          data: payload,
        })
      ).status(),
    ).toBe(409);
    expect(
      await db()
        .select()
        .from(registrationEvents)
        .where(eq(registrationEvents.operation, "staff_remove")),
    ).toHaveLength(0);
    const scopedId = 69001;
    await db()
      .insert(users)
      .values({ osuId: scopedId, username: "Synthetic scoped operator" });
    await db().insert(staffRoles).values({
      userId: scopedId,
      role: "admin",
      editionSlug: "test-cup",
      grantedBy: f.staff.osuId,
    });
    const scopedSession = await createSession(scopedId);
    await context.addCookies([
      {
        name: "oclr_session",
        value: scopedSession.token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(
      (
        await context.request.post(endpoint, {
          headers: { origin: "http://127.0.0.1:3100" },
          data: payload,
        })
      ).status(),
    ).toBe(403);
    for (const [index, role] of (["mappooler", "referee"] as const).entries()) {
      const userId = 69101 + index;
      await db()
        .insert(users)
        .values({ osuId: userId, username: `Synthetic ${role}` });
      await db()
        .insert(staffRoles)
        .values({ userId, role, editionSlug: slug, grantedBy: f.staff.osuId });
      const session = await createSession(userId);
      await context.addCookies([
        {
          name: "oclr_session",
          value: session.token,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      expect(
        (
          await context.request.post(endpoint, {
            headers: { origin: "http://127.0.0.1:3100" },
            data: payload,
          })
        ).status(),
      ).toBe(403);
    }
    const [grant] = await db()
      .insert(staffRoles)
      .values({
        userId: scopedId,
        role: "admin",
        editionSlug: slug,
        grantedBy: f.staff.osuId,
      })
      .returning();
    await context.addCookies([
      {
        name: "oclr_session",
        value: scopedSession.token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(
      (
        await context.request.post(endpoint, {
          headers: { origin: "http://127.0.0.1:3100" },
          data: payload,
        })
      ).status(),
    ).toBe(409);
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.id, grant.id));
    expect(
      (
        await context.request.post(endpoint, {
          headers: { origin: "http://127.0.0.1:3100" },
          data: payload,
        })
      ).status(),
    ).toBe(403);
  });
});
