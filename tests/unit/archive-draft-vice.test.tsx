import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HistoricalArchiveView } from "@/components/historical-archive";
import { english } from "@/i18n/translate";
import type { HistoricalArchive } from "@/lib/historical-archive";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";

vi.mock("@/i18n/server", () => ({ getAppTranslations: async () => english }));
vi.mock("@/i18n/shared", () => ({ useAppTranslations: () => english }));

async function draftPage(slug: string) {
  const player = historicalArchive.players[2];
  const archive: HistoricalArchive = {
    ...historicalArchive,
    editionSlug: slug,
    formatVersion: 2,
    draftMode: "final-tiers",
    picks: [],
    players: [
      ...historicalArchive.players,
      ...[2, 3, 4].map((tier) => ({
        ...player,
        osuId: 91900 + tier,
        username: `Synthetic Tier ${tier}`,
        tier,
      })),
      {
        ...player,
        osuId: 91991,
        username: "synthetic-vice",
        sourceRole: "VICE",
        tier: null,
      },
      {
        ...player,
        osuId: 91992,
        username: "Synthetic substitute",
        tier: null,
      },
    ],
  };
  return renderToStaticMarkup(
    await HistoricalArchiveView({
      edition: { ...edition, slug, archive },
      archive,
      section: "draft",
    }),
  );
}

it("lists the saved S3 vice separately from the four draft tiers", async () => {
  const html = await draftPage("s3");
  expect(
    Array.from(html.matchAll(/<h2>(Tier [1-4]|VICE)<\/h2>/g), (m) => m[1]),
  ).toEqual(["Tier 1", "Tier 2", "Tier 3", "Tier 4", "VICE"]);
  const vice = html.split("<h2>VICE</h2>")[1]?.split("</section>")[0];
  expect(vice).toContain('href="/players/91991?edition=s3"');
  expect(vice).toContain(">synthetic-vice</a>");
  expect(vice).toContain(">VICE</span>");
  expect(vice).toContain('href="/tournaments/s3/teams/alpha"');
  expect(html).not.toContain("Synthetic substitute");
  expect(await draftPage("s4")).not.toContain("<h2>VICE</h2>");
});
