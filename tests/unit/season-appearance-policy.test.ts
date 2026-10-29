import { expect, it } from "vitest";
import {
  appearances,
  publicAppearances,
  seasonAppearances,
  isPublicAppearance,
  readVisitorAppearance,
  readSiteAppearance,
} from "../../src/lib/preferences";
import { inheritedAppearance } from "../../src/lib/appearance-scope";

it.each(seasonAppearances)(
  "allows %s only through an authorized current edition",
  (theme) => {
    expect(appearances).toContain(theme);
    expect(isPublicAppearance(theme)).toBe(false);
    expect(readVisitorAppearance(theme, "cute-pastel")).toBe("cute-pastel");
    expect(readSiteAppearance(theme)).toBe("default");
    const scopes = [
      { slug: "a", defaultAppearance: theme, published: true, staff: false },
      {
        slug: "b",
        defaultAppearance: "swiss-minimal" as const,
        published: true,
        staff: true,
      },
      {
        slug: "private",
        defaultAppearance: theme,
        published: false,
        staff: true,
      },
    ];
    const at = (path: string, search = "") =>
      inheritedAppearance(path, new URLSearchParams(search), scopes, theme);
    expect(at("/tournaments/a").appearance).toBe(theme);
    expect(at("/players/42", "edition=a").appearance).toBe(theme);
    expect(at("/tournaments/b").appearance).toBe("swiss-minimal");
    expect(at("/privacy").appearance).toBe("default");
    expect(at("/tournaments/private").appearance).toBe("default");
    expect(at("/admin/tournaments/a").appearance).toBe("default");
    expect(at("/admin/tournaments/private").appearance).toBe(theme);
    expect(at("/tournaments/a/draft/overlay").edition).toBe(false);
    expect(at("/tournaments/a/draft/overlay").appearance).toBe("default");
    expect(at("/tournaments/a/draft", "presenter=1").appearance).toBe(
      "default",
    );
    // Ignoring a forged preference must not disable the same legitimate edition default.
    expect(readVisitorAppearance(theme, at("/tournaments/a").appearance)).toBe(
      theme,
    );
    expect(readVisitorAppearance("default", theme)).toBe("default");
  },
);
it.each(publicAppearances)("retains the public/site choice %s", (theme) => {
  expect(isPublicAppearance(theme)).toBe(true);
  expect(readVisitorAppearance(theme, "skyline-pop")).toBe(theme);
  expect(readSiteAppearance(theme)).toBe(theme);
});
