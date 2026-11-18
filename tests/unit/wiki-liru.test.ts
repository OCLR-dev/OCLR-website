import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import { appTranslator } from "../../src/i18n/translate";
import { liruGallery, wikiArticles } from "../../src/lib/wiki-articles";

// WebP canvas size from the VP8X/VP8L/VP8 header, so declared figure sizes cannot drift from the files.
function webpSize(path: string) {
  const b = readFileSync(path);
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WEBP");
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X")
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return {
    width: b.readUInt16LE(26) & 0x3fff,
    height: b.readUInt16LE(28) & 0x3fff,
  };
}

describe("Liru Wiki article (#334, #442, #536)", () => {
  it.each([
    ["en", en],
    ["zh-Hans", hans],
    ["zh-Hant", hant],
  ] as const)(
    "is complete and keeps literal values in %s",
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
      const article = wikiArticles(tr).find((item) => item.slug === "liru")!;
      expect(article).toBeDefined();
      expect(article.sections.map((section) => section.id)).toEqual([
        "profile",
        "design",
        "expressions",
        "outfit-chinese",
        "outfit-chinese-palette",
        "stickers",
        "palette",
        "usage",
        "credits",
      ]);
      const text = JSON.stringify(article);
      expect(text).not.toMatch(/\{designer\}/);
      expect(article.intro).toContain("JerrYamada");
      if (locale !== "en") expect(text).not.toContain("official mascot");

      const figures = article.sections.flatMap(
        (section) => section.figures ?? [],
      );
      expect(figures.map((figure) => figure.src)).toEqual([
        "/mascot/liru/sheet-main.webp",
        "/mascot/liru/sheet-turnaround.webp",
        "/mascot/liru/sheet-expressions.webp",
        "/mascot/liru/sheet-outfit-chinese.webp",
        "/mascot/liru/sheet-stickers.webp",
      ]);
      for (const figure of figures) {
        expect(figure.alt.length).toBeGreaterThan(10);
        expect(figure.caption).not.toBe("");
        expect(webpSize(`public${figure.src}`)).toEqual({
          width: figure.width,
          height: figure.height,
        });
      }

      const palette = article.sections.find(
        (section) => section.id === "palette",
      )!.table!.rows;
      expect(palette.map((row) => row[1])).toEqual([
        "#DED1F8",
        "#8D88C1",
        "#806DC1",
        "#F4F1FF",
        "#FEF5F6",
        "#A4C264",
        "#CEF9B7",
        "#E0DCFA",
        "#7067B6",
        "#FFFFFF",
        "#C3CADC",
        "#E8556A",
        "#4C7BE5",
      ]);
      const outfitPalette = article.sections.find(
        (section) => section.id === "outfit-chinese-palette",
      )!.table!.rows;
      expect(outfitPalette.map((row) => row[1])).toEqual([
        "#D4CFE5",
        "#899E5E",
        "#BBB6D3",
        "#809275",
        "#F3F3F3",
        "#675C68",
        "#FAF1EB",
        "#C9CEDA",
      ]);
      const credits = article.sections.find(
        (section) => section.id === "credits",
      )!.paragraphs![1] as (string | { label: string; href: string })[];
      expect(credits).toContainEqual({
        label: "CC BY 4.0",
        href: "https://creativecommons.org/licenses/by/4.0/",
      });
    },
  );
});

it("links the Liru gallery and includes every portrait at both sizes", () => {
  const native = createTranslator({ locale: "en", messages: en.ui });
  const tr = appTranslator(
    (key, values) => native(key as keyof typeof en.ui, values),
    "en",
  );
  const articles = wikiArticles(tr);
  const profile = articles.find((article) => article.slug === "liru")!;
  const gallery = liruGallery(tr);
  expect(articles.some((article) => article.slug === "liru-gallery")).toBe(
    false,
  );
  expect(profile.related).toEqual({ href: "/gallery", title: gallery.title });
  expect(gallery.gallery).toHaveLength(124);
  expect(new Set(gallery.gallery.map((figure) => figure.src)).size).toBe(124);
  expect(new Set(gallery.gallery.map((figure) => figure.rarity))).toEqual(
    new Set(["UR", "SSR", "SR", "R"]),
  );
  for (const figure of gallery.gallery) {
    expect(webpSize(`public${figure.src}`)).toEqual({
      width: 1024,
      height: 1536,
    });
    expect(webpSize(`public${figure.previewSrc}`)).toEqual({
      width: 640,
      height: 960,
    });
  }
});

describe("Liru sticker pack (#536)", () => {
  const manifest = JSON.parse(
    readFileSync("public/mascot/liru/stickers/manifest.json", "utf8"),
  ) as {
    license: string;
    stickers: {
      id: string;
      name: Record<string, string>;
      alt: Record<string, string>;
      files: Record<string, { png: string; webp: string }>;
    }[];
  };

  it("lists every sticker with bilingual names, alt text and existing square files", () => {
    expect(manifest.license).toBe("CC BY 4.0");
    expect(manifest.stickers.map((s) => s.id)).toEqual([
      "pick",
      "ban",
      "mod-nm",
      "mod-hd",
      "mod-hr",
      "mod-dt",
      "mod-fm",
      "mod-tb",
    ]);
    for (const sticker of manifest.stickers) {
      for (const locale of ["zh-Hans", "en"]) {
        expect(sticker.name[locale]).not.toBe("");
        expect(sticker.alt[locale].length).toBeGreaterThan(5);
      }
      expect(
        Object.keys(sticker.files)
          .map(Number)
          .sort((a, b) => a - b),
      ).toEqual([64, 128, 256, 512]);
      for (const [size, files] of Object.entries(sticker.files)) {
        expect(webpSize(`public/mascot/liru/stickers/${files.webp}`)).toEqual({
          width: Number(size),
          height: Number(size),
        });
        const png = readFileSync(`public/mascot/liru/stickers/${files.png}`);
        expect(png.readUInt32BE(16)).toBe(Number(size));
        expect(png.readUInt32BE(20)).toBe(Number(size));
      }
    }
  });

  it("links every file in the manifest from the Wiki sticker table", () => {
    const native = createTranslator({ locale: "en", messages: en.ui });
    const tr = appTranslator(
      (key, values) => native(key as keyof typeof en.ui, values),
      "en",
    );
    const rows = wikiArticles(tr)
      .find((article) => article.slug === "liru")!
      .sections.find((section) => section.id === "stickers")!.table!.rows;
    const hrefs = (cell: (typeof rows)[number][number]) =>
      typeof cell === "string"
        ? []
        : cell.flatMap((part) => (typeof part === "string" ? [] : [part.href]));
    expect(rows.map((row) => row[0])).toEqual(
      manifest.stickers.map((s) => s.id),
    );
    for (const [i, sticker] of manifest.stickers.entries()) {
      const files = Object.values(sticker.files);
      expect(hrefs(rows[i][2]).sort()).toEqual(
        files.map((f) => `/mascot/liru/stickers/${f.png}`).sort(),
      );
      expect(hrefs(rows[i][3]).sort()).toEqual(
        files.map((f) => `/mascot/liru/stickers/${f.webp}`).sort(),
      );
    }
  });
});
