import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BeatmapActions } from "../../src/components/beatmap-actions";
import { english } from "../../src/i18n/translate";
vi.mock("../../src/i18n/shared", () => ({ useAppTranslations: () => english }));
afterEach(() => vi.unstubAllGlobals());
describe("archive edit destinations", () => {
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
});
