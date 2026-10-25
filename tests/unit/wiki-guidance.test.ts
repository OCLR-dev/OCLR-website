import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import { appTranslator } from "../../src/i18n/translate";
import { wikiArticles } from "../../src/lib/wiki-articles";
describe("localized Wiki navigation guidance", () => {
  it.each([
    ["en", en],
    ["zh-Hans", hans],
    ["zh-Hant", hant],
  ] as const)(
    "matches the header entry in %s without translating literal content",
    (locale, catalog) => {
      const native = createTranslator({
        locale,
        messages: catalog.ui,
        onError(error) {
          throw error;
        },
      });
      const tr = appTranslator(
        (key, values) => native(key as keyof typeof catalog.ui, values),
        locale,
      );
      const article = wikiArticles(tr)[0];
      const item = article.sections.find((section) => section.id === "journey")!
        .items![0];
      const community = article.sections.find(
        (section) => section.id === "community",
      )!.paragraphs!;
      const sentence = (
        community[1] as (string | { label: string; href: string })[]
      ).at(-1) as string;
      expect(item).toContain(tr("Information page"));
      expect(sentence).toContain(tr("Information page"));
      expect(item + sentence).not.toContain("{informationPage}");
      if (locale !== "en")
        expect(item + sentence).not.toContain("Information page");
      expect(community[0]).toBe("QQ群 926872640");
      expect((community[1] as unknown[])[1]).toEqual({
        label: "OCL Series",
        href: "https://discord.gg/graS4RJHjM",
      });
      expect(article.title).toBe("认识 OCLR");
    },
  );
});
