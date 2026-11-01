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
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
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
    await seedEditions([
      {
        ...edition,
        slug: "test-map-history",
        name: "Synthetic historical cup",
        registration: null,
        season: "0",
        status: "completed",
        archive: {
          ...structuredClone(historicalArchive),
          editionSlug: "test-map-history",
          pools: [
            {
              ...historicalArchive.pools[0],
              maps: [{ ...historicalArchive.pools[0].maps[0], beatmapId: 123 }],
            },
          ],
        },
      },
    ]);
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
      const formalApi = "/api/admin/tournaments/test-cup/mappools";
      const currentRounds = await (await pooler.request.get(formalApi)).json();
      const startPosition =
        Math.max(
          0,
          ...currentRounds.rounds
            .filter((r: { stage: string }) => r.stage === "group")
            .map((r: { position: number }) => r.position),
        ) + 1;
      const plannedRounds: { id: string; name: string }[] = [];
      for (let n = 0; n < 2; n++) {
        const name = `Planned round ${testerId}-${Date.now()}-${n}`;
        const response = await pooler.request.post(formalApi, {
          headers: { Origin: origin },
          data: {
            action: "round_create",
            stage: "group",
            name,
            position: startPosition + n,
            confirmed: true,
          },
        });
        expect(response.status()).toBe(200);
        plannedRounds.push(
          (await response.json()).rounds.find(
            (r: { name: string }) => r.name === name,
          ),
        );
      }
      await openTournamentTool(
        page,
        "test-cup",
        "Map selection workbench",
        isMobile,
      );
      await page
        .getByLabel("Beatmap IDs or difficulty URLs")
        .fill("123\nnot-a-bid\nhttps://osu.ppy.sh/beatmaps/123\n456");
      const batchRounds = page.getByRole("group", {
        name: "Intended rounds (multiple)",
        exact: true,
      });
      for (const round of plannedRounds)
        await batchRounds
          .getByRole("checkbox", { name: new RegExp(round.name) })
          .check();
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
        workspace.candidates
          .find((c: { beatmapId: number }) => c.beatmapId === 123)
          .roundIds.sort(),
      ).toEqual(plannedRounds.map((r) => r.id).sort());
      const historyEndpoint = `${endpoint}/${id}/history`;
      expect((await guest.request.get(historyEndpoint)).status()).toBe(401);
      const checkHistory = candidate.getByRole("button", {
        name: "Check history",
        exact: true,
      });
      await context.route(
        `**${historyEndpoint}`,
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 750));
          await route.continue();
        },
        { times: 1 },
      );
      await checkHistory.click();
      const historyDialog = candidate.getByRole("dialog", {
        name: "Historical mappool usage",
        exact: true,
      });
      await expect(
        historyDialog.getByText("Checking history…", { exact: true }),
      ).toBeVisible();
      await expect(
        historyDialog.getByRole("link", {
          name: "Synthetic historical cup",
          exact: true,
        }),
      ).toHaveAttribute("href", "/tournaments/test-map-history/mappools/final");
      await expect(
        historyDialog.getByText("NM1", { exact: true }),
      ).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).include("dialog[open]").analyze())
          .violations,
      ).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(historyDialog).toHaveCount(0);
      await expect(checkHistory).toBeFocused();
      const unused = page.getByRole("article", {
        name: "BID 456",
        exact: true,
      });
      await unused
        .getByRole("button", { name: "Check history", exact: true })
        .click();
      const emptyHistory = unused.getByRole("dialog", {
        name: "Historical mappool usage",
        exact: true,
      });
      await expect(
        emptyHistory.getByText("No historical records found.", { exact: true }),
      ).toBeVisible();
      await emptyHistory
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await context.route(`**${historyEndpoint}`, (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Could not check historical mappool usage.",
          }),
        }),
      );
      await checkHistory.click();
      await expect(historyDialog.getByRole("alert")).toBeVisible();
      await expect(
        historyDialog.getByText("No historical records found.", {
          exact: true,
        }),
      ).toHaveCount(0);
      await context.unroute(`**${historyEndpoint}`);
      await historyDialog
        .getByRole("button", { name: "Retry", exact: true })
        .click();
      await expect(
        historyDialog.getByRole("link", {
          name: "Synthetic historical cup",
          exact: true,
        }),
      ).toBeVisible();
      await historyDialog
        .getByRole("button", { name: "Close", exact: true })
        .click();
      const intent = candidate.getByRole("group", {
        name: "Intended rounds",
        exact: true,
      });
      for (const round of plannedRounds)
        await expect(
          intent.getByRole("button", { name: /^Intended rounds:/ }),
        ).toHaveAttribute("aria-label", new RegExp(round.name));
      const compactCard = candidate.locator(".map-browse-card--band");
      const compactHeight = (await compactCard.boundingBox())!.height;
      await intent.getByRole("button", { name: /^Intended rounds:/ }).click();
      const roundPicker = intent.getByRole("dialog", {
        name: "Intended rounds (multiple)",
        exact: true,
      });
      await expect(roundPicker).toBeVisible();
      expect((await compactCard.boundingBox())!.height).toBe(compactHeight);
      expect(
        (
          await new AxeBuilder({ page })
            .include("[popover]:popover-open")
            .analyze()
        ).violations,
      ).toEqual([]);
      await expect(roundPicker.getByRole("checkbox").first()).toBeFocused();
      const pickerBox = await roundPicker.boundingBox();
      expect(pickerBox!.x).toBeGreaterThanOrEqual(0);
      expect(pickerBox!.x + pickerBox!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      expect(pickerBox!.y + pickerBox!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
      );
      for (const name of ["Save", "Cancel"]) {
        const actionBox = await roundPicker
          .getByRole("button", { name, exact: true })
          .boundingBox();
        expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
          pickerBox!.y + pickerBox!.height,
        );
      }
      await roundPicker
        .getByRole("checkbox", { name: new RegExp(plannedRounds[1].name) })
        .uncheck();
      await page.keyboard.press("Escape");
      await expect(roundPicker).not.toBeVisible();
      await intent.getByRole("button", { name: /^Intended rounds:/ }).click();
      await expect(
        roundPicker.getByRole("checkbox", {
          name: new RegExp(plannedRounds[1].name),
        }),
      ).toBeChecked();
      await roundPicker
        .getByRole("checkbox", { name: new RegExp(plannedRounds[1].name) })
        .uncheck();
      await intent.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        intent.getByRole("button", { name: /^Intended rounds:/ }),
      ).toBeFocused();
      await expect(
        intent.getByRole("button", { name: /^Intended rounds:/ }),
      ).not.toHaveAttribute("aria-label", new RegExp(plannedRounds[1].name));
      await intent.getByRole("button", { name: /^Intended rounds:/ }).click();
      await roundPicker
        .getByRole("button", { name: "Clear selection", exact: true })
        .click();
      await roundPicker
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(roundPicker).not.toBeVisible();
      await intent.getByRole("button", { name: /^Intended rounds:/ }).click();
      await expect(
        roundPicker.getByRole("checkbox", {
          name: new RegExp(plannedRounds[0].name),
        }),
      ).toBeChecked();
      await page.mouse.click(2, 2);
      await expect(roundPicker).not.toBeVisible();
      await page.reload();
      await expect(
        intent.getByRole("button", { name: /^Intended rounds:/ }),
      ).toHaveAttribute("aria-label", new RegExp(plannedRounds[0].name));
      await expect(
        intent.getByRole("button", { name: /^Intended rounds:/ }),
      ).not.toHaveAttribute("aria-label", new RegExp(plannedRounds[1].name));

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
      const cardRounds = card.getByRole("group", {
        name: "Intended rounds",
        exact: true,
      });
      const cardCategory = card.getByRole("combobox", {
        name: "Mod category",
        exact: true,
      });
      await expect(cardRounds).toBeVisible();
      await expect(cardCategory).toBeVisible();
      await expect(
        card.getByRole("link", {
          name: "Synthetic Artist — Synthetic Browser Song",
        }),
      ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/123");
      await expect(card.locator(".map-card-mode")).toHaveCount(0);
      await expect(card.locator(".map-card-extension")).toHaveCount(0);
      await expect(card.locator("time")).toHaveCount(0);
      await expect(
        card.locator(".map-card-side").getByText("Added by", { exact: false }),
      ).toBeVisible();
      await expect(
        card
          .locator(".map-slot-badge")
          .getByRole("combobox", { name: "Mod category", exact: true }),
      ).toHaveCount(1);
      await expect(
        card
          .locator(".map-card-side")
          .getByRole("group", { name: "Intended rounds", exact: true }),
      ).toHaveCount(1);
      const mapBox = await card.boundingBox();
      const commentBox = await candidate
        .getByLabel("Your comment")
        .boundingBox();
      expect(commentBox!.y).toBeGreaterThan(mapBox!.y + mapBox!.height);
      const coverBox = await card.locator(".map-card-cover").boundingBox();
      const categoryBox = await cardCategory.boundingBox();
      const roundBox = await cardRounds.boundingBox();
      expect(categoryBox!.x).toBeLessThan(coverBox!.x + coverBox!.width / 2);
      expect(categoryBox!.y).toBeLessThan(coverBox!.y + coverBox!.height / 2);
      if (!isMobile) {
        expect(roundBox!.y + roundBox!.height).toBeLessThanOrEqual(
          coverBox!.y + coverBox!.height,
        );
      } else {
        const hpBox = await card
          .locator(".map-card-values > span")
          .last()
          .boundingBox();
        expect(roundBox!.y).toBeGreaterThanOrEqual(hpBox!.y + hpBox!.height);
      }

      for (const control of [cardRounds, cardCategory]) {
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(mapBox!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          mapBox!.x + mapBox!.width + 1,
        );
        expect(box!.y + box!.height).toBeLessThanOrEqual(
          mapBox!.y + mapBox!.height,
        );
      }
      // The right-side planning panel must not intercept the map action links.
      for (const action of await card.locator(".beatmap-actions a").all()) {
        expect(
          await action.evaluate((link) => {
            link.scrollIntoView({ block: "center", behavior: "instant" });
            const box = link.getBoundingClientRect();
            const hit = document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            );
            return hit !== null && link.contains(hit);
          }),
        ).toBe(true);
      }
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
      const poolerCard = poolerRow.locator(".map-browse-card--band");
      const promotionHeight = (await poolerCard.boundingBox())!.height;
      await poolerCard
        .getByRole("button", { name: "Add to official pool", exact: true })
        .click();
      const promotionPanel = poolerRow.getByRole("dialog", {
        name: "Add to official pool",
        exact: true,
      });
      await expect(promotionPanel).toBeVisible();
      await expect(promotionPanel.getByLabel("Target round")).toBeEnabled();
      await expect(promotionPanel.getByLabel("Target round")).toBeFocused();
      expect((await poolerCard.boundingBox())!.height).toBe(promotionHeight);
      await poolerPage.keyboard.press("Escape");
      await expect(promotionPanel).not.toBeVisible();
      await expect(
        poolerRow.getByRole("button", {
          name: "Add to official pool",
          exact: true,
        }),
      ).toBeFocused();
      await poolerRow
        .getByRole("button", { name: "Add to official pool", exact: true })
        .click();
      await expect(promotionPanel.getByLabel("Target round")).toBeEnabled();
      await expect(poolerCard.getByLabel("Target round")).toBeVisible();
      await expect(poolerCard.getByLabel("Target pool")).toBeVisible();
      await expect(poolerRow.getByLabel("Target pool")).toBeDisabled();
      await poolerRow.getByLabel("Target round").selectOption(roundId);
      await expect(
        poolerRow
          .getByLabel("Target pool")
          .getByRole("option", { name: /Candidate destination/ }),
      ).toHaveCount(1);
      await poolerRow.getByLabel("Target pool").selectOption(targetPool.id);
      await poolerRow
        .getByLabel("Target round")
        .selectOption(plannedRounds[0].id);
      await expect(poolerRow.getByLabel("Target pool")).toHaveValue("");
      await expect(
        poolerRow
          .getByLabel("Target pool")
          .getByRole("option", { name: /Candidate destination/ }),
      ).toHaveCount(0);
      await expect(poolerRow.getByLabel("Beatmap URL or ID")).toHaveCount(0);
      await poolerRow.getByLabel("Target round").selectOption(roundId);
      await poolerRow.getByLabel("Target pool").selectOption(targetPool.id);
      await expect(poolerRow.getByLabel("Beatmap URL or ID")).toHaveValue(
        "123",
      );
      await expect(poolerRow.getByLabel("Beatmap URL or ID")).toHaveAttribute(
        "readonly",
        "",
      );
      const promotionBox = await promotionPanel.boundingBox();
      expect(promotionBox!.x).toBeGreaterThanOrEqual(0);
      expect(promotionBox!.y).toBeGreaterThanOrEqual(0);
      expect(promotionBox!.x + promotionBox!.width).toBeLessThanOrEqual(
        poolerPage.viewportSize()!.width,
      );
      expect(promotionBox!.y + promotionBox!.height).toBeLessThanOrEqual(
        poolerPage.viewportSize()!.height,
      );
      expect((await poolerCard.boundingBox())!.height).toBe(promotionHeight);
      expect(
        (
          await new AxeBuilder({ page: poolerPage })
            .include("[popover]:popover-open")
            .analyze()
        ).violations,
      ).toEqual([]);
      await promotionPanel.screenshot({
        path: `/tmp/oclr-promotion-${isMobile ? "mobile" : "desktop"}.png`,
      });

      await poolerRow
        .getByRole("button", { name: "Add beatmap", exact: true })
        .click();
      await expect(
        poolerRow
          .getByRole("status")
          .filter({ hasText: "Candidate added to the official pool." }),
      ).toBeVisible();
      expect((await poolerCard.boundingBox())!.height).toBe(promotionHeight);
      await expect(promotionPanel).toBeVisible();
      await promotionPanel
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await expect(promotionPanel).not.toBeVisible();
      await expect(
        poolerRow.getByRole("button", {
          name: "Add to official pool",
          exact: true,
        }),
      ).toBeFocused();
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
      for (const theme of ["light", "dark"]) {
        await pooler.addCookies([
          { name: "oclr-locale", value: "zh-Hant", url: origin },
          { name: "oclr-theme", value: theme, url: origin },
        ]);
        await poolerPage.reload();
        const previewCard = poolerPage
          .getByRole("article", { name: "BID 123", exact: true })
          .locator(".map-browse-card--band");
        const promotion = previewCard.getByRole("button", {
          name: "加入正式圖池",
          exact: true,
        });
        await expect(promotion).toBeVisible();
        for (const control of [
          promotion,
          previewCard.getByRole("button", { name: /^指定輪次:/ }),
          previewCard.getByRole("button", { name: "查詢歷史", exact: true }),
        ]) {
          await expect(control.locator("svg")).toHaveCount(1);
          await expect(control).toHaveText("");
          await expect(control).toHaveAttribute("title", /.+/);
          const iconBox = await control.boundingBox();
          expect(iconBox!.width).toBe(44);
          expect(iconBox!.height).toBe(44);
        }

        if (isMobile) {
          const roundIcon = await previewCard
            .getByRole("button", { name: /^指定輪次:/ })
            .boundingBox();
          const poolIcon = await promotion.boundingBox();
          expect(Math.abs(roundIcon!.y - poolIcon!.y)).toBeLessThan(2);
        }
        await expect(previewCard.locator(".map-card-extension")).toHaveCount(0);
        await expect(previewCard.locator("time")).toHaveCount(0);
        if (!isMobile) {
          const controls = previewCard.locator(".map-card-side");
          const addedBy = controls.getByText("新增者", { exact: false });
          const rounds = controls.getByRole("group", {
            name: "指定輪次",
            exact: true,
          });
          const boxes = await Promise.all(
            [
              previewCard.locator(".map-card-values > span").first(),
              addedBy,
              rounds,
              promotion,
            ].map((control) => control.boundingBox()),
          );
          const centers = boxes.map((box) => box!.y + box!.height / 2);
          expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2);
          for (let i = 1; i < boxes.length; i++) {
            expect(boxes[i - 1]!.x + boxes[i - 1]!.width).toBeLessThanOrEqual(
              boxes[i]!.x,
            );
          }
          await expect(
            previewCard.locator(":scope > .map-card-side"),
          ).toHaveCount(0);
        }
        if (!isMobile)
          await previewCard.evaluate((card) => {
            window.scrollTo(
              0,
              window.scrollY + card.getBoundingClientRect().top - 112,
            );
          });
        await previewCard.screenshot({
          style: "header { visibility: hidden !important; }",
          path: `/tmp/oclr-workbench-card-${isMobile ? "mobile" : "desktop"}-${theme}.png`,
        });
        await previewCard.getByRole("button", { name: /^指定輪次:/ }).click();
        const previewPicker = previewCard.getByRole("dialog");
        await expect(previewPicker).toBeVisible();
        await expect(
          previewPicker.getByRole("button", { name: "儲存", exact: true }),
        ).toBeVisible();
        const optionsBox = await previewPicker
          .locator("fieldset")
          .locator("..")
          .boundingBox();
        const saveBox = await previewPicker
          .getByRole("button", { name: "儲存", exact: true })
          .boundingBox();
        expect(optionsBox!.y + optionsBox!.height).toBeLessThanOrEqual(
          saveBox!.y,
        );
        await previewPicker.screenshot({
          path: `/tmp/oclr-rounds-dropdown-${isMobile ? "mobile" : "desktop"}-${theme}.png`,
        });
        await previewPicker
          .getByRole("button", { name: "取消", exact: true })
          .click();
        await previewCard
          .getByRole("button", { name: "查詢歷史", exact: true })
          .click();
        const historyPreview = previewCard.getByRole("dialog", {
          name: "歷史圖池使用紀錄",
          exact: true,
        });
        await expect(
          historyPreview.getByRole("link", {
            name: "Synthetic historical cup",
            exact: true,
          }),
        ).toBeVisible();
        const historyBox = await historyPreview.boundingBox();
        expect(historyBox!.x).toBeGreaterThanOrEqual(0);
        expect(historyBox!.x + historyBox!.width).toBeLessThanOrEqual(
          poolerPage.viewportSize()!.width,
        );
        await historyPreview.screenshot({
          path: `/tmp/oclr-map-history-${isMobile ? "mobile" : "desktop"}-${theme}.png`,
        });
        await historyPreview
          .getByRole("button", { name: "關閉", exact: true })
          .click();
        await promotion.click();
        const promotionPreview = previewCard.getByRole("dialog", {
          name: "加入正式圖池",
          exact: true,
        });
        await expect(promotionPreview.getByLabel("目標輪次")).toBeEnabled();
        await promotionPreview.getByLabel("目標輪次").selectOption(roundId);
        await promotionPreview
          .getByLabel("目標圖池")
          .selectOption(targetPool.id);
        await expect(
          promotionPreview.getByLabel("譜面連結或 ID"),
        ).toBeVisible();
        await promotionPreview.screenshot({
          path: `/tmp/oclr-promotion-${isMobile ? "mobile" : "desktop"}-${theme}.png`,
        });
        await promotionPreview
          .getByRole("button", { name: "關閉", exact: true })
          .click();
      }
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
      expect((await context.request.get(historyEndpoint)).status()).toBe(403);
      expect(
        (await context.request.get(`${endpoint}/${id}/comments`)).status(),
      ).toBe(403);
    } finally {
      await guest.close();
      await pooler.close();
    }
  });
});
