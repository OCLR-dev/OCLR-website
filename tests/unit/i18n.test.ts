import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import { defaultLocale, locales, readLocale } from "../../src/i18n/config";
import { appTranslator } from "../../src/i18n/translate";
import { readThemePreference } from "../../src/lib/preferences";
import { formatDate } from "../../src/lib/editions";

describe("localized interface catalogs", () => {
  it("uses the organizer-approved Simplified Chinese default with strict cookie allowlists", () => {
    expect(defaultLocale).toBe("zh-Hans");
    for (const locale of locales) expect(readLocale(locale)).toBe(locale);
    for (const invalid of [undefined, "../../private", "zh", "<script>"])
      expect(readLocale(invalid)).toBe("zh-Hans");
    expect(readThemePreference(undefined)).toBe("system");
    expect(readThemePreference("dark")).toBe("dark");
    expect(readThemePreference("invalid")).toBe("system");
  });
  it("has identical keys and valid ICU parameters in every language", () => {
    const parameters = (text: string) =>
      [
        ...new Set([...text.matchAll(/\{(\w+)(?:,|\})/g)].map((m) => m[1])),
      ].sort();
    for (const [locale, catalog] of [
      ["en", en],
      ["zh-Hans", hans],
      ["zh-Hant", hant],
    ] as const) {
      expect(Object.keys(catalog.ui).sort()).toEqual(Object.keys(en.ui).sort());
      const tr = createTranslator({
        locale,
        messages: catalog.ui,
        onError(error) {
          throw error;
        },
      });
      for (const [key, source] of Object.entries(en.ui)) {
        const message = catalog.ui[key as keyof typeof catalog.ui];
        expect(message.trim(), `${locale} ${source}`).not.toBe("");
        expect(parameters(message), `${locale} ${source}`).toEqual(
          parameters(source),
        );
        const values = Object.fromEntries(
          parameters(source).map((name) => [
            name,
            /count|Wins/.test(name) ? 2 : "Sample",
          ]),
        );
        expect(
          () => tr(key as keyof typeof catalog.ui, values),
          `${locale} ${source}`,
        ).not.toThrow();
      }
    }
  });
  it("registers every literal translation call instead of silently falling back", () => {
    const known = new Set<string>([
      ...Object.values(en.ui),
      ...Object.keys(en.ui),
    ]);
    const missing: string[] = [];
    const hardcoded: string[] = [];
    for (const name of readdirSync(resolve("src"), {
      recursive: true,
    }) as string[]) {
      if (!/\.tsx?$/.test(name)) continue;
      const source = ts.createSourceFile(
        name,
        readFileSync(resolve("src", name), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        name.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const walk = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
          const text = node.text.trim().replace(/\s+/g, " ");
          if (
            /[a-zA-Z]{3}/.test(text) &&
            ![
              "UTC",
              "OCLR",
              "osu!", // Game branding on the compact sign-in control stays literal.
              "osu! Chinese League Rookie",
              "Muziyami", // Contributor identity, kept literal in every locale.
              "/tournaments/",
            ].includes(text)
          )
            hardcoded.push(`${name}: ${text}`);
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === "tr" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) &&
          !known.has(node.arguments[0].text)
        )
          missing.push(`${name}: ${node.arguments[0].text}`);
        ts.forEachChild(node, walk);
      };
      walk(source);
    }
    expect(missing).toEqual([]);
    expect(hardcoded).toEqual([]);
  });
  it("localizes known UI errors and preserves arbitrary organizer/player content literally", () => {
    for (const [locale, catalog] of [
      ["zh-Hans", hans],
      ["zh-Hant", hant],
    ] as const) {
      const native = createTranslator({ locale, messages: catalog.ui });
      const tr = appTranslator(
        (key, values) => native(key as keyof typeof catalog.ui, values),
        locale,
      );
      expect(tr("navigation_home")).not.toBe(tr("Home"));
      expect(tr("draft_module")).not.toBe(tr("Draft"));
      expect(tr("draft_members", { count: 2 })).toContain("2");
      expect(tr("Pick committed to Home · 原文.")).toBe(
        native("draft_pick_committed", { team: "Home · 原文" }),
      );
      expect(tr("Selection cancelled.")).not.toBe("Selection cancelled.");
      expect(tr("Sign in with osu! to continue.")).not.toBe(
        "Sign in with osu! to continue.",
      );
      expect(
        tr("Approved organizer wording that has no translated variant."),
      ).toBe("Approved organizer wording that has no translated variant.");
      expect(tr("Username <script>literal</script>")).toBe(
        "Username <script>literal</script>",
      );
      expect(
        tr("{count, plural, one {# changed field} other {# changed fields}}", {
          count: 3,
        }),
      ).toContain("3");
    }
    expect(
      formatDate("2026-01-01T00:00:00Z", "Asia/Taipei", "zh-Hans"),
    ).toContain("08:00");
    expect(formatDate("2026-01-01T00:00:00Z", "Asia/Taipei", "en")).toContain(
      "UTC+8",
    );
  });
});
