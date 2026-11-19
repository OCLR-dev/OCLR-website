import { test, expect } from "@playwright/test";

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test(`the player id pill clears the overlaid avatar (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/player-profile-cover");
    const pill = page.locator(".profile-id-badge");
    await expect(pill).toBeVisible();

    const pillBox = (await pill.boundingBox())!;
    const avatarBox = (await page
      .locator(".profile-cover-content .avatar")
      .boundingBox())!;
    // The pill is pinned to the card corner, so the overlaid heading has to
    // start below it instead of sharing the corner.
    expect(avatarBox.y).toBeGreaterThanOrEqual(pillBox.y + pillBox.height);

    // Narrow covers reserve the pill's row; that gap is the same 1.25rem the
    // other cover groups keep from the artwork edges.
    if (viewport.name === "phone") {
      expect(avatarBox.y - (pillBox.y + pillBox.height)).toBeCloseTo(20, 0);
    }
  });
}

test("long previous usernames stay on one line and pause on hover", async ({
  page,
}) => {
  await page.goto("/player-profile-cover");
  const aliases = page.locator('[class*="previousNames"]').first();
  await expect(aliases).toHaveAttribute("data-overflowing", "true");

  const viewport = aliases.locator('[class*="previousNamesViewport"]');
  const track = aliases.locator('[class*="previousNamesTrack"]');
  await expect(viewport).toBeVisible();
  expect(await viewport.evaluate((node) => node.clientHeight)).toBeLessThan(40);
  expect(
    await track.evaluate((node) => getComputedStyle(node).animationName),
  ).toContain("previousNamesMarquee");

  await aliases.hover();
  expect(
    await track.evaluate((node) => getComputedStyle(node).animationPlayState),
  ).toBe("paused");
  // Pausing keeps the names as ordinary selectable text for drag selection.
  expect(
    await aliases
      .locator('[class*="previousNamesViewport"]')
      .evaluate((node) => getComputedStyle(node).userSelect),
  ).toBe("text");
});

test("the improvement index carries the faster-than-typical colour band", async ({
  page,
}) => {
  await page.goto("/player-profile-cover");
  const badges = page.locator(".bws-card-metric").nth(3);
  await expect(badges.locator(".bws-card-label")).toHaveText("Weighted badge");
  await expect(badges.locator(".bws-value")).toHaveText("1/2");
  const metric = page.locator(".bws-card-metric").last();
  await expect(metric.locator(".bws-card-label")).toHaveText("OII");
  const value = metric.locator(".bws-value");
  await expect(value).toHaveText("1.35");
  await expect(value).toHaveClass(/bws-value--oii-up/);
  await expect(value).toHaveClass(/bws-value--rank-tier/);
});

for (const display of ["rating-notes", "compact-notes"]) {
  test(`the ${display} profile controls expose both saved rating breakdowns`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/player-profile-cover?${display}`);
    const etx = page.getByRole("button", { name: "About the ETX rating" });
    if (isMobile) await etx.tap();
    else await etx.press("Enter");
    const note = page.locator("[popover]:popover-open");
    await expect(note).toContainText("Elitebotix API · OCLR fetch time");
    await expect(note.locator("time")).toHaveAttribute(
      "datetime",
      "2025-06-02T12:00:00Z",
    );
    for (const [mod, value] of [
      ["NM", "0.00 ★"],
      ["HD", "5.13 ★"],
      ["HR", "No rating data"],
      ["DT", "6.00 ★"],
      ["FM", "4.00 ★"],
      ["Provisional rating", "Yes"],
      ["Outdated rating", "Unknown"],
    ]) {
      await expect(
        note.getByText(mod, { exact: true }).locator("..").locator("dd"),
      ).toHaveText(value);
    }
    const bounds = (await note.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await page.keyboard.press("Escape");
    await expect(note).toHaveCount(0);

    const sip = page.getByRole("button", { name: "About the SIP rating" });
    if (isMobile) await sip.tap();
    else await sip.press("Enter");
    await expect(note).toContainText("Overall SIP rating: -4");
    await expect(
      note.getByText(/S11 CSV · OCLR import time/).locator("time"),
    ).toHaveAttribute("datetime", "2025-06-01T12:00:00Z");
    await expect(
      note.getByText(/SkillIssue API · OCLR fetch time/).locator("time"),
    ).toHaveAttribute("datetime", "2025-06-03T12:00:00Z");
    await expect(note.getByText("Hard Rock: 0", { exact: true })).toBeVisible();
    await note.getByText("High AR: -12", { exact: true }).click();
    await expect(
      note
        .locator("details[open]")
        .getByText("SIP country rank", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tournament ratings" }),
    ).toHaveCount(0);
  });
}

test("stat explanations open by their triggers and fit below the sticky header", async ({
  page,
  isMobile,
}) => {
  await page.goto("/player-profile-cover?sticky-header");
  const viewport = page.viewportSize()!;
  const card = page.locator(".bws-card");

  for (const [label, linkName] of [
    ["pp"],
    ["Global rank", "BWS formula"],
    ["Badges"],
    ["OII"],
    ["o!TR", "View on o!TR"],
    ["SIP"],
    ["ETX"],
  ]) {
    const metric = card.locator(".bws-card-metric").filter({
      has: page.getByText(label, { exact: true }),
    });
    const trigger = metric.getByRole("button");
    // Put each trigger just below the sticky header, including when the
    // metrics stack vertically on the phone.
    await trigger.evaluate((node) => {
      const header = document.querySelector("header.site-header")!;
      window.scrollBy(
        0,
        node.getBoundingClientRect().top -
          header.getBoundingClientRect().bottom -
          8,
      );
    });
    if (isMobile) await trigger.tap();
    else await trigger.press("Enter");

    const note = metric.getByRole("note");
    await expect(note).toBeVisible();
    const noteBox = (await note.boundingBox())!;
    const triggerBox = (await trigger.boundingBox())!;
    expect(noteBox.y).toBeGreaterThan(triggerBox.y + triggerBox.height);
    expect(noteBox.x).toBeGreaterThanOrEqual(0);
    expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(viewport.width);
    expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(viewport.height);
    expect(noteBox.width).toBeLessThanOrEqual(21 * 16);
    expect(triggerBox.x + triggerBox.width / 2).toBeGreaterThanOrEqual(
      noteBox.x,
    );
    expect(triggerBox.x + triggerBox.width / 2).toBeLessThanOrEqual(
      noteBox.x + noteBox.width,
    );

    if (linkName) {
      const link = note.getByRole("link", { name: linkName });
      if (!isMobile) {
        await page.keyboard.press("Tab");
        await expect(link).toBeFocused();
      }
      await link.click({ trial: true });
    }
    await page.keyboard.press("Escape");
    await expect(note).toBeHidden();
  }
});
