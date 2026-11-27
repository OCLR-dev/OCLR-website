import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { registrations, editionState } from "../../src/db/schema";
import { prepareDraft } from "../fixtures/draft";
import { createSession } from "../../src/lib/auth/sessions";
import { assertTestDatabase } from "../database";
import { randomUUID } from "node:crypto";
async function preferences(
  context: BrowserContext,
  locale = "en",
  theme = "dark",
) {
  await context.addCookies([
    { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
    { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
  ]);
}
test.describe("editable tournament and explicit draft recovery", () => {
  test.skip(!process.env.TEST_DATABASE_URL);
  test.setTimeout(120000);
  test.afterAll(closeDb);
  async function setup(context: BrowserContext, base: number) {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ADMIN_OSU_IDS = String(base);
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    const f = await prepareDraft(`recovery-${base}-test`, base, 4);
    const session = await createSession(base);
    await context.addCookies([
      {
        name: "oclr_session",
        value: session.token,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await preferences(context);
    return f;
  }
  test("started draft keeps settings forms editable in each locale without reopening enrollment", async ({
    page,
    context,
    isMobile,
    request,
  }) => {
    const base = isMobile ? 120001 : 110001,
      slug = `recovery-${base}-test`;
    await setup(context, base);
    const before = await db().select().from(registrations);
    await page.goto(`/admin/tournaments/${slug}/settings?section=registration`);
    await expect(
      page.getByLabel("Enable registration during this window", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Enable registration during this window", { exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Save registration settings", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db()
              .select()
              .from(editionState)
              .where(eq(editionState.slug, slug))
          )[0].configuration!.registration!.enabled,
      )
      .toBe(false);
    await page.goto(`/admin/tournaments/${slug}/settings?section=rules`);
    await page.getByLabel("Minimum PP", { exact: true }).fill("100");
    await page
      .getByRole("button", { name: "Save rules & eligibility", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db()
              .select()
              .from(editionState)
              .where(eq(editionState.slug, slug))
          )[0].configuration!.automaticEligibility?.minPp,
      )
      .toBe(100);
    await page.goto(`/admin/tournaments/${slug}/settings?section=schedule`);
    await page
      .getByLabel("Phase type", { exact: true })
      .selectOption("knockout");
    await page
      .getByRole("button", { name: "Save milestones", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db()
              .select()
              .from(editionState)
              .where(eq(editionState.slug, slug))
          )[0].configuration!.schedule[0].label,
      )
      .toBe("quarterfinals");
    expect(await db().select().from(registrations)).toEqual(before);
    const state = (
      await db().select().from(editionState).where(eq(editionState.slug, slug))
    )[0];
    expect(state.lockedAt).not.toBeNull();
    expect(state.registrationPausedAt).not.toBeNull();
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const section of ["registration", "rules", "schedule"]) {
        await preferences(context, locale);
        await page.goto(
          `/admin/tournaments/${slug}/settings?section=${section}`,
        );
        await expect(page.getByRole("tabpanel")).toBeVisible();
        expect(
          await page.getByRole("tabpanel").locator("input,textarea").count(),
        ).toBeGreaterThan(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    await preferences(context);
    await page.goto(`/admin/tournaments/${slug}/settings?section=registration`);
    await page
      .getByRole("button", { name: "Resume registration", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db()
              .select()
              .from(editionState)
              .where(eq(editionState.slug, slug))
          )[0].registrationPausedAt,
      )
      .toBeNull();
    expect(
      (await (await request.get(`/api/tournaments/${slug}`)).json())
        .registration.state,
    ).toBe("paused");
    expect(
      (
        await db()
          .select()
          .from(editionState)
          .where(eq(editionState.slug, slug))
      )[0].lockedAt,
    ).not.toBeNull();
  });
  test("Pause and edit protects confirmed turns, permits team correction and future order, and explicitly resets with retained history", async ({
    page,
    context,
    isMobile,
    browser,
  }) => {
    const base = isMobile ? 120001 : 110001,
      slug = `recovery-${base}-test`;
    const f = await setup(context, base);
    const api = `/api/admin/tournaments/${slug}/draft`,
      origin = "http://127.0.0.1:3100";
    const state = async () => (await context.request.get(api)).json();
    const s = (await state()).session;
    expect(
      (
        await context.request.post(`/api/tournaments/${slug}/draft/picks`, {
          headers: { origin },
          data: {
            sessionId: s.id,
            turnIndex: s.turnIndex,
            candidateId: f.players[0].osuId,
            expectedVersion: s.version,
            idempotencyKey: randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    const captainContext = await browser.newContext({ baseURL: origin });
    try {
      const token = await createSession(f.a.osuId);
      await captainContext.addCookies([
        {
          name: "oclr_session",
          value: token.token,
          domain: "127.0.0.1",
          path: "/",
        },
      ]);
      const now = await state();
      expect(
        (
          await captainContext.request.post(api, {
            headers: { origin },
            data: {
              command: {
                action: "unlock",
                expectedSetupVersion: now.edition.setupVersion,
              },
              expectedVersion: now.session.version,
              confirmed: true,
            },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await captainContext.close();
    }
    await page.goto(`/admin/tournaments/${slug}/draft`);
    await page
      .getByRole("button", { name: "Pause and edit", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Save draft configuration",
        exact: true,
      }),
    ).toBeVisible();
    expect((await state()).session.state).toBe("paused");
    await page.goto(`/admin/tournaments/${slug}/teams`);
    await page
      .getByRole("button", { name: "Edit team", exact: true })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Team name", { exact: true })
      .fill("Corrected synthetic team");
    await page
      .getByRole("dialog")
      .getByLabel("Roster capacity (optional)", { exact: true })
      .fill("4");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save team", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto(`/admin/tournaments/${slug}/draft`);
    await page
      .getByRole("combobox", { name: "Order mode", exact: true })
      .selectOption("custom");
    await expect(
      page.getByRole("combobox", { name: "Turn 1", exact: true }),
    ).toBeDisabled();
    const first = (await state()).session.turnSequence[0];
    await page
      .getByRole("combobox", { name: "Turn 2", exact: true })
      .selectOption(first);
    await expect(
      page.getByRole("button", { name: "Resume draft", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Save draft configuration", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resume draft", exact: true }),
    ).toBeEnabled();
    const order = (await state()).session.turnSequence;
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"]) {
        await preferences(context, locale, theme);
        await page.goto(`/admin/tournaments/${slug}/draft`);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    await preferences(context);
    await page.goto(`/admin/tournaments/${slug}/draft`);
    await page
      .getByRole("button", { name: "Resume draft", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause and edit", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pause and edit", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Force reset draft", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Force reset draft", exact: true })
      .click();
    const resetDialog = page.getByRole("dialog", { name: "Force reset draft" });
    await expect(resetDialog).toContainText("void confirmed picks");
    await resetDialog
      .getByRole("button", { name: "Force reset draft", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start draft", exact: true }),
    ).toBeVisible();
    const reset = await state();
    expect(reset.session.state).toBe("setup");
    expect(reset.session.turnSequence).toEqual(order);
    expect(reset.picks).toHaveLength(1);
    expect(reset.picks[0].voidedAt).not.toBeNull();
    expect(
      reset.members.every(
        (m: { membership: { origin: string } }) =>
          m.membership.origin === "captain",
      ),
    ).toBe(true);
    expect(reset.edition.registrationPausedAt).not.toBeNull();
    expect(
      await (
        await context.request.get(`/api/tournaments/${slug}/draft`)
      ).json(),
    ).toBeNull();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
});
