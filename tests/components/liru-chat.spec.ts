import { expect, test } from "@playwright/test";
test("stop a pending turn, retry with sources, and start fresh in another edition", async ({
  page,
}) => {
  let count = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const editions: string[] = [];
  await page.route("**/api/chat", async (route) => {
    count++;
    editions.push(route.request().postDataJSON().edition);
    if (count === 1) {
      await gate;
      await route.abort().catch(() => {});
      return;
    }
    const chunks = [
      { type: "start" },
      {
        type: "source-url",
        sourceId: "1",
        title: "Substitution",
        url: "/tournaments/cup-a#rules-1",
      },
      { type: "text-start", id: "a" },
      { type: "text-delta", id: "a", delta: "Ask the referee." },
      { type: "text-end", id: "a" },
      { type: "finish" },
    ];
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") +
        "data: [DONE]\n\n",
    });
  });
  await page.goto("/liru-chat");
  await page.getByRole("textbox").fill("Substitution?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => count).toBe(1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  release();
  await expect(page.getByRole("textbox")).toHaveValue("Substitution?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Ask the referee.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "[1] Substitution" }),
  ).toHaveAttribute("href", "/tournaments/cup-a#rules-1");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => count).toBe(3);
  await page.getByRole("button", { name: "Switch season" }).click();
  await expect(page.getByRole("log", { includeHidden: true })).toBeEmpty();
  await page.getByRole("textbox").fill("Next match?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() => editions)
    .toEqual(["cup-a", "cup-a", "cup-a", "cup-b"]);
});
