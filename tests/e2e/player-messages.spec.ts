import { test, expect } from "@playwright/test";
import { db, closeDb } from "../../src/db";
import { registrations, users } from "../../src/db/schema";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { seedSession } from "./session";

test.describe("player identity, introduction and signed messages", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("renders real answer projection, authenticates messages and preserves signatures", async ({
    page,
    context,
    isMobile,
  }) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const base = isMobile ? 321010 : 321000;
    const slug = `player-message-${base}-test`;
    const cookie = await seedSession(base);
    await seedEditions([
      {
        ...edition,
        slug,
        registration: {
          ...edition.registration!,
          publicIntroductionQuestionId: "intro",
          questions: [
            {
              id: "intro",
              label: "Self introduction",
              type: "text",
              required: false,
              maxLength: 500,
            },
          ],
        },
      },
    ]);
    await db()
      .insert(users)
      .values({ osuId: base + 1, username: "Synthetic Introduction Player" })
      .onConflictDoNothing();
    await db()
      .insert(registrations)
      .values({
        editionSlug: slug,
        userId: base + 1,
        status: "accepted",
        configurationVersion: 0,
        answers: {
          intro: "Literal submitted introduction\nsecond line",
          private: "NEVER_PUBLIC_CONTACT",
        },
      })
      .onConflictDoNothing();
    const path = `/tournaments/${slug}/players`;
    const endpoint = `/api/tournaments/${slug}/players/${base + 1}/messages`;
    const unsigned = await context.request.post(endpoint, {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: { requestId: crypto.randomUUID(), text: "Unauthenticated" },
    });
    expect(unsigned.status()).toBe(401);
    const unsignedEdit = await context.request.patch(
      `${endpoint}/${crypto.randomUUID()}`,
      {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { version: "1", text: "forged" },
      },
    );
    expect(unsignedEdit.status()).toBe(401);
    await page.route("https://a.ppy.sh/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="#7650a0"/></svg>',
      }),
    );
    await page.goto(path);
    await expect(
      page.getByRole("link", {
        name: "Sign in with osu! to leave a signed message",
      }),
    ).toBeVisible();
    await expect(page.locator(".event-player-bio")).toContainText(
      "Literal submitted introduction",
    );
    await expect(page.locator(".event-player-row")).not.toContainText(
      "NEVER_PUBLIC_CONTACT",
    );
    await expect(page.locator(".event-player-identity img")).toHaveAttribute(
      "src",
      `https://a.ppy.sh/${base + 1}`,
    );
    await context.addCookies([cookie]);
    await page.reload();
    const message = "Literal signed message <script>text</script>";
    const compose = page.getByRole("button", {
      name: "Leave a message",
      exact: true,
    });
    await expect(page.locator(".player-message-form")).toHaveCount(0);
    await compose.click();
    await page
      .getByLabel("Leave a signed message for Synthetic Introduction Player", {
        exact: true,
      })
      .fill(message);
    await page
      .getByRole("button", { name: "Post message", exact: true })
      .click();
    await expect(page.locator(".event-message-scroll")).toContainText(message);
    await expect(page.locator(".event-message-scroll")).toContainText(
      `Synthetic Player ${base}`,
    );
    await expect(page.locator(".player-message-form")).toHaveCount(0);
    await compose.click();
    await page
      .getByRole("textbox", {
        name: "Leave a signed message for Synthetic Introduction Player",
        exact: true,
      })
      .fill("retained draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(compose).toBeFocused();
    await compose.click();
    await expect(
      page.getByRole("textbox", {
        name: "Leave a signed message for Synthetic Introduction Player",
        exact: true,
      }),
    ).toHaveValue("retained draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const original = (await (await context.request.get(endpoint)).json())[0];
    await page
      .getByRole("button", { name: "Edit message", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Edit message", exact: true }),
    ).toHaveValue(message);
    await page
      .getByRole("textbox", { name: "Edit message", exact: true })
      .fill("Edited literal message");
    await page.route(`${endpoint}/*`, (route) => route.abort(), { times: 1 });
    await page
      .getByRole("button", { name: "Save message", exact: true })
      .click();
    await expect(
      page.locator(".event-player-messages [role=alert]"),
    ).toContainText("This request could not be completed");
    await expect(
      page.getByRole("textbox", { name: "Edit message", exact: true }),
    ).toHaveValue("Edited literal message");
    await page
      .getByRole("button", { name: "Save message", exact: true })
      .click();
    await expect(page.locator(".player-message-form")).toHaveCount(0);
    await expect(page.locator(".event-message-scroll")).toContainText(
      "Edited literal message",
    );
    const stale = await context.request.patch(`${endpoint}/${original.id}`, {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: { text: "stale", version: original.version },
    });
    expect(stale.status()).toBe(409);
    await page
      .getByRole("button", { name: "Delete message", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".event-message-scroll")).toContainText(
      "Edited literal message",
    );
    await page
      .getByRole("button", { name: "Delete message", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm delete", exact: true })
      .click();
    await expect(page.locator(".event-message-scroll")).toHaveText("—");
    await compose.click();
    await page
      .getByRole("textbox", {
        name: "Leave a signed message for Synthetic Introduction Player",
        exact: true,
      })
      .fill(message);
    await page
      .getByRole("button", { name: "Post message", exact: true })
      .click();
    await expect(page.locator(".event-message-scroll")).toContainText(message);
    const additional = [];
    for (const text of ["Second visible message", "Third visible message"]) {
      const response = await context.request.post(endpoint, {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { text, requestId: crypto.randomUUID() },
      });
      expect(response.status()).toBe(201);
      additional.push(await response.json());
    }
    await page.reload();
    await expect(page.locator(".event-message-scroll > div")).toHaveCount(1);
    const seen = new Set<string>();
    for (let n = 0; n < 3; n++) {
      seen.add(await page.locator(".event-message-scroll p").innerText());
      await page
        .getByRole("button", { name: "Next message", exact: true })
        .click();
    }
    expect(seen.size).toBe(3);
    const selected = await page.locator(".event-message-scroll p").innerText();
    await compose.click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".event-message-scroll p")).toHaveText(selected);
    await page
      .getByRole("button", { name: "Previous message", exact: true })
      .click();
    for (const m of additional)
      expect(
        (
          await context.request.delete(`${endpoint}/${m.id}`, {
            headers: { Origin: "http://127.0.0.1:3100" },
            data: { version: m.version },
          })
        ).status(),
      ).toBe(200);
    await page.reload();
    await expect(page.locator(".event-message-scroll")).toContainText(message);
    const forged = await context.request.post(endpoint, {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {
        requestId: crypto.randomUUID(),
        text: "forged",
        authorId: base + 1,
      },
    });
    expect(forged.status()).toBe(400);
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-locale",
              value: locale,
              domain: "127.0.0.1",
              path: "/",
            },
            {
              name: "oclr-appearance",
              value: appearance,
              domain: "127.0.0.1",
              path: "/",
            },
            {
              name: "oclr-theme",
              value: theme,
              domain: "127.0.0.1",
              path: "/",
            },
          ]);
          await page.setViewportSize({
            width: isMobile ? 320 : 1440,
            height: 1000,
          });
          await page.reload();
          await expect(page.locator(".event-message-scroll")).toContainText(
            message,
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          const row = page.locator(".event-player-row");
          const bounds = await row.boundingBox();
          expect(bounds!.height).toBeLessThan(isMobile ? 500 : 230);
          const add = page.getByRole("button", {
            name:
              locale === "en"
                ? "Add reaction"
                : locale === "zh-Hans"
                  ? "添加表情"
                  : "新增表情",
            exact: true,
          });
          const before = await add.boundingBox();
          if (!isMobile) {
            await add.hover();
            expect(
              await add.evaluate(
                (e) => new DOMMatrix(getComputedStyle(e).transform).m42,
              ),
            ).toBe(0);
            expect((await add.boundingBox())!.y).toBe(before!.y);
          }
          await add.click();
          await expect(
            page.getByRole("group", {
              name:
                locale === "en"
                  ? "Choose an emoji"
                  : locale === "zh-Hans"
                    ? "选择表情"
                    : "選擇表情",
              exact: true,
            }),
          ).toBeVisible();
          await page
            .getByRole("button", {
              name:
                locale === "en"
                  ? "React with 呲牙"
                  : locale === "zh-Hans"
                    ? "贴上 呲牙"
                    : "貼上 呲牙",
              exact: true,
            })
            .click();
          await expect(add).toBeFocused();
          await page
            .getByRole("button", {
              name:
                locale === "en"
                  ? "React with 呲牙"
                  : locale === "zh-Hans"
                    ? "贴上 呲牙"
                    : "貼上 呲牙",
              exact: true,
            })
            .click();
          await page.evaluate(() => {
            (document.activeElement as HTMLElement | null)?.blur();
            window.scrollTo(0, 0);
          });
        }
  });
});
