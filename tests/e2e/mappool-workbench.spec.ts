import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  staffRoles,
  mappoolCandidates,
  mappoolCandidateComments,
} from "../../src/db/schema";
import { seedSession } from "./session";
import { openTournamentTool } from "./navigation";
const origin = process.env.OCLR_TEST_ORIGIN || "http://127.0.0.1:3100";
const endpoint = "/api/admin/tournaments/test-cup/mappool-workbench";
test.describe("private Pooler/Tester selection workbench", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("batch preview, two-author comments, lost response retry and private readable layout", async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
    const testerId = isMobile ? 572110 : 572100,
      poolerId = testerId + 1;
    const cookie = await seedSession(testerId),
      poolerCookie = await seedSession(poolerId);
    await db().delete(mappoolCandidateComments);
    await db().delete(mappoolCandidates);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: testerId,
          role: "tester",
          editionSlug: "test-cup",
          grantedBy: testerId,
        },
        {
          userId: poolerId,
          role: "mappooler",
          editionSlug: "test-cup",
          grantedBy: testerId,
        },
      ]);
    await context.addCookies([cookie]);
    await context.route("https://assets.ppy.sh/**", (route) => route.abort());
    const guest = await browser.newContext({ baseURL: origin });
    const pooler = await browser.newContext({ baseURL: origin });
    await pooler.addCookies([
      poolerCookie,
      { name: "oclr-locale", value: "en", url: origin },
    ]);
    try {
      expect((await guest.request.get(endpoint)).status()).toBe(401);
      expect(
        (
          await context.request.post(endpoint, {
            headers: { Origin: "https://wrong.example" },
            data: { action: "preview", text: "123" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await context.request.post(
            "/api/admin/tournaments/test-cup/mappools",
            { headers: { Origin: origin }, data: {} },
          )
        ).status(),
      ).toBe(403);
      await openTournamentTool(
        page,
        "test-cup",
        "Map selection workbench",
        isMobile,
      );
      await page
        .getByLabel("Beatmap IDs or difficulty URLs")
        .fill("123\nnot-a-bid\nhttps://osu.ppy.sh/beatmaps/123\n456");
      await page
        .getByRole("button", { name: "Preview candidates", exact: true })
        .click();
      await expect(page.getByText(/Row 2 · Invalid BID/)).toBeVisible();
      await expect(page.getByText(/Row 3 · Duplicate/)).toBeVisible();
      await page
        .getByRole("button", {
          name: "Add selected candidates (2)",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: "Candidate maps (2)", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Beatmap IDs or difficulty URLs"),
      ).toHaveValue("not-a-bid");
      await page.reload();
      const candidate = page.getByRole("article", {
        name: "BID 123",
        exact: true,
      });
      const workspace = await (await pooler.request.get(endpoint)).json();
      const id = workspace.candidates.find(
        (c: { beatmapId: number }) => c.beatmapId === 123,
      ).id;
      expect(
        (
          await pooler.request.post(endpoint, {
            headers: { Origin: origin },
            data: {
              action: "comment",
              candidateId: id,
              requestId: crypto.randomUUID(),
              body: "Synthetic Pooler feedback",
            },
          })
        ).status(),
      ).toBe(200);
      expect(
        (await guest.request.get(`${endpoint}/${id}/comments`)).status(),
      ).toBe(401);
      await expect(candidate.getByLabel("Your comment")).toBeVisible();
      await candidate.getByRole("button", { name: "Refresh comments" }).click();
      await expect(
        candidate.getByText("Synthetic Pooler feedback"),
      ).toBeVisible();
      let feedback =
        "Synthetic Tester feedback <script>window.executed = true</script>";
      await candidate.getByLabel("Your comment").fill(feedback);
      await context.route(`**${endpoint}`, async (route) => {
        if (
          route.request().method() === "POST" &&
          route.request().postDataJSON().action === "comment"
        ) {
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      });
      await candidate
        .getByRole("button", { name: "Post comment", exact: true })
        .click();
      await expect(candidate.getByRole("alert")).toBeVisible();
      await expect(candidate.getByLabel("Your comment")).toHaveValue(feedback);
      await context.unroute(`**${endpoint}`);
      await candidate
        .getByRole("button", { name: "Post comment", exact: true })
        .click();
      await expect(
        candidate.getByText(feedback, { exact: true }),
      ).toBeVisible();
      await expect(
        candidate.getByText("Comments (2)", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => (window as Window & { executed?: boolean }).executed,
        ),
      ).toBeUndefined();
      expect(
        await db()
          .select()
          .from(mappoolCandidateComments)
          .where(eq(mappoolCandidateComments.candidateId, id)),
      ).toHaveLength(2);
      // Only each author gets mutation controls. A stale edit keeps its draft.
      const ownComment = candidate.getByRole("listitem").filter({
        has: page.locator(`a[href="https://osu.ppy.sh/users/${testerId}"]`),
      });
      const otherComment = candidate.getByRole("listitem").filter({
        has: page.locator(`a[href="https://osu.ppy.sh/users/${poolerId}"]`),
      });
      await expect(
        otherComment.getByRole("button", { name: "Edit", exact: true }),
      ).toHaveCount(0);
      await expect(
        otherComment.getByRole("button", { name: "Delete", exact: true }),
      ).toHaveCount(0);
      const commentsEndpoint = `${endpoint}/${id}/comments`;
      const current = (
        await (await context.request.get(commentsEndpoint)).json()
      ).find((c: { authorId: number }) => c.authorId === testerId);
      expect(
        (
          await pooler.request.post(endpoint, {
            headers: { Origin: origin },
            data: {
              action: "comment_edit",
              candidateId: id,
              commentId: current.id,
              version: current.version,
              body: "Forged",
            },
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await context.request.post(endpoint, {
            headers: { Origin: "https://example.invalid" },
            data: {
              action: "comment_delete",
              candidateId: id,
              commentId: current.id,
              version: current.version,
            },
          })
        ).status(),
      ).toBe(403);
      await ownComment
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      const revised = `${feedback} revised`;
      await ownComment.getByLabel("Edit comment").fill(revised);
      expect(
        (
          await context.request.post(endpoint, {
            headers: { Origin: origin },
            data: {
              action: "comment_edit",
              candidateId: id,
              commentId: current.id,
              version: current.version,
              body: "Other tab revision",
            },
          })
        ).status(),
      ).toBe(200);
      await ownComment
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(ownComment.getByRole("alert")).toContainText(
        "This comment has changed",
      );
      await expect(ownComment.getByLabel("Edit comment")).toHaveValue(revised);
      await ownComment
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await candidate
        .getByRole("button", { name: "Refresh comments", exact: true })
        .click();
      await expect(
        ownComment.getByText("Other tab revision", { exact: true }),
      ).toBeVisible();
      await ownComment
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await ownComment.getByLabel("Edit comment").fill(revised);
      await ownComment
        .getByRole("button", { name: "Save", exact: true })
        .click();
      feedback = revised;
      await expect(
        ownComment.getByText(feedback, { exact: true }),
      ).toBeVisible();
      // Deletion requires confirmation, updates the count and leaves other authors intact.
      await candidate
        .getByLabel("Your comment")
        .fill("Temporary deletion check");
      await candidate
        .getByRole("button", { name: "Post comment", exact: true })
        .click();
      const temporary = candidate
        .getByRole("listitem")
        .filter({ hasText: "Temporary deletion check" });
      await temporary
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await temporary
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(temporary).toBeVisible();
      await temporary
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await temporary
        .getByRole("button", { name: "Confirm delete", exact: true })
        .click();
      await expect(temporary).toHaveCount(0);
      await expect(
        candidate.getByRole("button", {
          name: "Refresh comments",
          exact: true,
        }),
      ).toBeFocused();
      await expect(
        candidate.getByText("Comments (2)", { exact: true }),
      ).toBeVisible();
      await expect(
        otherComment.getByText("Synthetic Pooler feedback", { exact: true }),
      ).toBeVisible();
      // Drafts stay mounted while switching Mod tabs; comments are always visible.
      await candidate.getByLabel("Your comment").fill("Unsaved draft");
      await page.getByRole("tab", { name: "HD (0)", exact: true }).click();
      await expect(candidate).not.toBeVisible();
      await page
        .getByRole("tab", { name: "Unassigned (2)", exact: true })
        .click();
      await expect(candidate.getByLabel("Your comment")).toHaveValue(
        "Unsaved draft",
      );
      await candidate.getByLabel("Your comment").fill("");
      await candidate
        .getByRole("combobox", { name: "Mod category" })
        .selectOption("HD");
      await page.getByRole("tab", { name: "HD (1)", exact: true }).click();
      await expect(
        candidate.getByText(feedback, { exact: true }),
      ).toBeVisible();
      await candidate
        .getByRole("combobox", { name: "Mod category" })
        .selectOption("unassigned");
      await page
        .getByRole("tab", { name: "Unassigned (2)", exact: true })
        .click();
      const card = candidate.locator(".map-browse-card--band");
      await expect(card).toBeVisible();
      await expect(
        card.getByRole("link", {
          name: "Synthetic Artist — Synthetic Browser Song",
        }),
      ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/123");
      await expect(card.locator(".map-card-mode")).toHaveCount(0);
      const mapBox = await card.boundingBox();
      const commentBox = await candidate
        .getByLabel("Your comment")
        .boundingBox();
      expect(commentBox!.y).toBeGreaterThan(mapBox!.y + mapBox!.height);
      await expect(
        candidate.getByRole("button", {
          name: "Add to official pool",
          exact: true,
        }),
      ).toHaveCount(0);

      // The Pooler selects the official pool and slot through the existing guarded editor.
      const formalEndpoint = "/api/admin/tournaments/test-cup/mappools";
      const roundName = `Workbench round ${testerId}-${Date.now()}`;
      const currentPools = await (
        await pooler.request.get(formalEndpoint)
      ).json();
      const nextRound =
        Math.max(
          0,
          ...currentPools.rounds
            .filter((r: { stage: string }) => r.stage === "group")
            .map((r: { position: number }) => r.position),
        ) + 1;
      let response = await pooler.request.post(formalEndpoint, {
        headers: { Origin: origin },
        data: {
          action: "round_create",
          stage: "group",
          name: roundName,
          position: nextRound,
          confirmed: true,
        },
      });
      expect(response.status()).toBe(200);
      let formal = await response.json();
      const roundId = formal.rounds.find(
        (r: { name: string }) => r.name === roundName,
      ).id;
      response = await pooler.request.post(formalEndpoint, {
        headers: { Origin: origin },
        data: {
          action: "pool_create",
          roundId,
          name: "Candidate destination",
          confirmed: true,
        },
      });
      expect(response.status()).toBe(200);
      formal = await response.json();
      const targetPool = formal.pools.find(
        (p: { roundId: string }) => p.roundId === roundId,
      );
      const poolerPage = await pooler.newPage();
      await poolerPage.goto("/admin/tournaments/test-cup/mappool-workbench");
      const poolerRow = poolerPage.getByRole("article", {
        name: "BID 123",
        exact: true,
      });
      await poolerRow
        .getByRole("button", { name: "Add to official pool", exact: true })
        .click();
      await poolerRow.getByLabel("Target pool").selectOption(targetPool.id);
      await expect(poolerRow.getByLabel("Beatmap URL or ID")).toHaveValue(
        "123",
      );
      await expect(poolerRow.getByLabel("Beatmap URL or ID")).toHaveAttribute(
        "readonly",
        "",
      );
      await poolerRow
        .getByRole("button", { name: "Add beatmap", exact: true })
        .click();
      await expect(
        poolerRow
          .getByRole("status")
          .filter({ hasText: "Candidate added to the official pool." }),
      ).toBeVisible();
      formal = await (await pooler.request.get(formalEndpoint)).json();
      expect(
        formal.entries.filter(
          (e: { poolId: string; beatmapId: number }) =>
            e.poolId === targetPool.id && e.beatmapId === 123,
        ),
      ).toHaveLength(1);
      expect(
        await (await pooler.request.get(`${endpoint}/${id}/comments`)).json(),
      ).toHaveLength(2);
      // A stale replay cannot insert another slot, and Tester cannot use the same endpoint.
      const replay = {
        action: "entry_save",
        confirmed: true,
        poolId: targetPool.id,
        expectedVersion: targetPool.version,
        entryId: null,
        beatmap: "123",
        category: "NM",
        position: 2,
      };
      expect(
        (
          await pooler.request.post(formalEndpoint, {
            headers: { Origin: origin },
            data: replay,
          })
        ).status(),
      ).toBe(409);
      expect(
        (
          await context.request.post(formalEndpoint, {
            headers: { Origin: origin },
            data: replay,
          })
        ).status(),
      ).toBe(403);
      await poolerPage.close();
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          { name: "oclr-theme", value: theme, url: origin },
        ]);
        await page.reload();
        const row = page.getByRole("article", { name: "BID 123", exact: true });
        await row.getByLabel("Your comment").scrollIntoViewIfNeeded();
        await expect(row.getByLabel("Your comment")).toBeVisible();
        await expect(row.getByText(feedback, { exact: true })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        expect(
          (await new AxeBuilder({ page }).include(".workspace-main").analyze())
            .violations,
        ).toEqual([]);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `/tmp/oclr-572-${isMobile ? "mobile" : "desktop"}-${theme}.png`,
          fullPage: true,
        });
      }
      for (const [locale, heading] of [
        ["zh-Hans", "选图工作台"],
        ["zh-Hant", "選圖工作臺"],
      ]) {
        await context.addCookies([
          { name: "oclr-locale", value: locale, url: origin },
        ]);
        await page.reload();
        await expect(
          page.getByRole("heading", { name: heading, exact: true }),
        ).toBeVisible();
      }
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, testerId));
      expect((await context.request.get(endpoint)).status()).toBe(403);
      expect(
        (await context.request.get(`${endpoint}/${id}/comments`)).status(),
      ).toBe(403);
    } finally {
      await guest.close();
      await pooler.close();
    }
  });
});
