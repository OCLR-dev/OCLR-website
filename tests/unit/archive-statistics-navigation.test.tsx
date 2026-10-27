import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TournamentNavigation } from "../../src/components/tournament-navigation";
import { statisticsSeasons } from "../../src/lib/archive-statistics-model";
const location = vi.hoisted(() => ({ path: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.path }));
vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () =>
    Object.assign((text: string) => text, { locale: "en" }),
}));
describe("historical statistics navigation", () => {
  it.each(statisticsSeasons)(
    "keeps %s legacy and menu links in the selected edition",
    (slug) => {
      location.path = `/tournaments/${slug}/statistics`;
      for (const mobileMenu of [false, true]) {
        const html = renderToStaticMarkup(
          <TournamentNavigation
            slug={slug}
            liveDraft={false}
            archived
            mobileMenu={mobileMenu}
          />,
        );
        const link = html
          .match(/<a\b[^>]*>/g)
          ?.find((tag) => tag.includes(`href="${location.path}"`));
        expect(link).toContain('aria-current="page"');
        expect(html).not.toContain("/tournaments/s11/");
      }
    },
  );
  it("does not advertise unsupported archives while preserving the live statistics destination", () => {
    location.path = "/tournaments/s11/statistics";
    for (const mobileMenu of [false, true]) {
      expect(
        renderToStaticMarkup(
          <TournamentNavigation
            slug="s11"
            liveDraft={false}
            archived
            mobileMenu={mobileMenu}
          />,
        ),
      ).not.toContain('href="/tournaments/s11/statistics"');
    }
    expect(
      renderToStaticMarkup(
        <TournamentNavigation slug="s11" liveDraft={false} mobileMenu />,
      ),
    ).toContain('href="/tournaments/s11/statistics"');
  });
});
