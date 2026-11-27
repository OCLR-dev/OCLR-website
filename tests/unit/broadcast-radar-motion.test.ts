import { describe, expect, it, vi } from "vitest";
import {
  paintRadar,
  radarFrame,
} from "../../src/components/broadcast-radar-motion";

function svgAttributes() {
  const attrs = new Map<string, string>();
  return {
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: vi.fn((name: string, value: string) =>
      attrs.set(name, value),
    ),
  };
}

describe("broadcast radar painting", () => {
  it("writes only the visible geometry and attributes that changed", () => {
    const area = svgAttributes();
    const outline = svgAttributes();
    const dots = Array.from({ length: 3 }, svgAttributes);
    const paint = paintRadar({
      querySelector: (selector: string) =>
        selector === "polygon" ? area : outline,
      querySelectorAll: () => dots,
    } as unknown as SVGGElement);

    const full = radarFrame([0.3, 0.4, 0.5]);
    paint(full);
    for (const element of [area, outline, ...dots])
      element.setAttribute.mockClear();
    paint(full);
    for (const element of [area, outline, ...dots])
      expect(element.setAttribute).not.toHaveBeenCalled();

    paint(radarFrame([0.3, 0.6, 0.5]));
    expect(area.setAttribute.mock.calls.map(([name]) => name)).toEqual([
      "points",
    ]);
    expect(outline.setAttribute).not.toHaveBeenCalled();
    expect(dots[0].setAttribute).not.toHaveBeenCalled();
    expect(dots[2].setAttribute).not.toHaveBeenCalled();

    paint(radarFrame([0.3, null, 0.5]));
    expect(area.getAttribute("opacity")).toBe("0");
    expect(outline.getAttribute("opacity")).toBe("1");
    expect(outline.getAttribute("d")).toContain(" L ");
    expect(dots[1].getAttribute("opacity")).toBe("0");
  });
});
