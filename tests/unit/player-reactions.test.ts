import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  parsePlayerReactions,
  playerReactions,
  searchPlayerReactions,
} from "../../src/lib/player-reactions";
import selection from "../../docs/verification/issue-969/selection.json";
import manifest from "../../public/reactions/manifest.json";

function pngChunks(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const chunks = new Map<string, Buffer>();
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    expect(offset + length + 12).toBeLessThanOrEqual(bytes.length);
    chunks.set(
      bytes.toString("ascii", offset + 4, offset + 8),
      bytes.subarray(offset + 8, offset + 8 + length),
    );
    offset += length + 12;
  }
  expect(chunks.has("IEND")).toBe(true);
  return chunks;
}

describe("player reaction catalog", () => {
  it("puts the exported shortlist first, followed by unique candidates with intact local images", () => {
    expect(
      playerReactions.slice(0, selection.selected.length).map((r) => r.id),
    ).toEqual(selection.selected.map((r) => r.key));
    expect(playerReactions).toHaveLength(408);
    expect(new Set(playerReactions.map((r) => r.id)).size).toBe(408);
    const sources = new Map(manifest.assets.map((a) => [a.file, a]));
    for (const reaction of playerReactions) {
      for (const src of [reaction.src, reaction.animatedSrc].filter(
        (s): s is string => !!s,
      )) {
        expect(src).toMatch(/^\/reactions\/[a-zA-Z0-9-]+\.(png|svg)$/);
        const bytes = readFileSync(
          new URL(`../../public${src}`, import.meta.url),
        );
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(
          sources.get(src.split("/").at(-1)!)?.sha256,
        );
        if (src.endsWith(".png")) {
          const chunks = pngChunks(bytes);
          if (src === reaction.src) {
            // Check the actual PNG metadata: a -png.png name can hide an APNG.
            for (const chunk of ["acTL", "fcTL", "fdAT"])
              expect(chunks.has(chunk), `${reaction.id} static ${chunk}`).toBe(
                false,
              );
          } else {
            expect(chunks.get("acTL")?.readUInt32BE(0)).toBeGreaterThan(1);
          }
        }
      }
    }
    expect(playerReactions.some((r) => r.id === "qq-122")).toBe(false);
  });
  it("keeps the same priority while searching names, aliases, and mod IDs", () => {
    expect(searchPlayerReactions("按按钮").map((r) => r.id)).toEqual([
      "qq-424",
    ]);
    expect(searchPlayerReactions("跪拜").map((r) => r.id)).toEqual(["qq-297"]);
    expect(searchPlayerReactions(" HD ").map((r) => r.id)).toContain("osu-HD");
    expect(searchPlayerReactions("qq 呲牙")[0].id).toBe("qq-13");
    expect(searchPlayerReactions("definitely-not-a-reaction")).toEqual([]);
  });
  it("retains legacy choices and rejects malformed, missing and duplicate IDs", () => {
    expect(
      parsePlayerReactions(
        '["💜","qq-424","qq-424","osu-HD","qq-122",null,3,"https://example.test/x.png"]',
      ),
    ).toEqual(["💜", "qq-424", "osu-HD"]);
    expect(parsePlayerReactions('{"id":"qq-13"}')).toEqual([]);
    expect(parsePlayerReactions("broken")).toEqual([]);
  });
});
