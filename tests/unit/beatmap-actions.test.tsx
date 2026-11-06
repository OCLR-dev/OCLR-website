import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BeatmapActions } from "../../src/components/beatmap-actions";
import { english } from "../../src/i18n/translate";
vi.mock("../../src/i18n/shared", () => ({ useAppTranslations: () => english }));
afterEach(() => vi.unstubAllGlobals());
describe("archive edit destinations", () => {
  it("offers a safe independent mirror when official identities are unavailable", () => {
    vi.stubGlobal("React", React);
    const mirror =
      "https://github.com/OCLR-dev/OCLR-website/raw/reviewed/map.osz";
    const html = renderToStaticMarkup(
      <BeatmapActions beatmapId={null} setId={null} downloadMirror={mirror} />,
    );
    expect(html).toContain(`href="${mirror}"`);
    expect(html).toContain("Download mirror");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("Beatmap ID unresolved");
    const invalid = renderToStaticMarkup(
      <BeatmapActions
        beatmapId={123}
        setId={null}
        downloadMirror="javascript:alert(1)"
      />,
    );
    expect(invalid).not.toContain("javascript:");
    expect(invalid).not.toContain("Download mirror");
    expect(invalid).toContain('href="osu://b/123"');
  });
  it("uses an explicitly confirmed original even with a cached edit set and no provider 404", () => {
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(
      <BeatmapActions
        beatmapId={2567502}
        setId={1235093}
        originalBeatmapId={2933979}
        originalSetId={1424727}
        preferOriginal
      />,
    );
    expect(html).toContain('href="https://osu.ppy.sh/beatmaps/2933979"');
    expect(html).toContain('href="osu://b/2933979"');
    expect(html).toContain("Open original map");
  });
  it.each([false, true])(
    "uses original links only for confirmed missing edits (%s)",
    (missing) => {
      vi.stubGlobal("React", React);
      const html = renderToStaticMarkup(
        <BeatmapActions
          beatmapId={123}
          setId={null}
          originalBeatmapId={456}
          originalSetId={789}
          beatmapMissing={missing}
        />,
      );
      expect(html).toContain(
        `href="https://osu.ppy.sh/beatmaps/${missing ? 456 : 123}"`,
      );
      expect(html).toContain(`href="osu://b/${missing ? 456 : 123}"`);
      expect(html.includes("Open original map")).toBe(missing);
    },
  );

  it.each([false, true])(
    "opens the web (secondary) action in a new tab (compact=%s)",
    (compact) => {
      vi.stubGlobal("React", React);
      const html = renderToStaticMarkup(
        <BeatmapActions beatmapId={123} setId={null} compact={compact} />,
      );
      const anchors = html.match(/<a\b[^>]*>/g) ?? [];
      const web = anchors.find((a) => a.includes("https://osu.ppy.sh/"));
      const direct = anchors.find((a) => a.includes("osu://b/"));
      expect(web).toContain('target="_blank"');
      expect(web).toContain('rel="noopener noreferrer"');
      expect(direct).not.toContain('target="_blank"');
      expect(direct).not.toContain('rel="noopener noreferrer"');
    },
  );
});
