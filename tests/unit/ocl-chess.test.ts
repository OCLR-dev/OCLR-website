import { describe, it, expect } from "vitest";
import {
  pixelCommand,
  chessAdminCommand,
  chessPalette,
} from "../../src/lib/ocl-chess-model";
describe("canvas input bounds", () => {
  it("rejects invalid coordinates, colors and extra fields", () => {
    const value = {
      requestId: "e18cbdd3-36d1-4d84-a89e-b932ef3ae251",
      x: 127,
      y: 0,
      color: 15,
    };
    expect(pixelCommand.safeParse(value).success).toBe(true);
    for (const patch of [
      { x: 128 },
      { y: -1 },
      { color: 16 },
      { x: 0.5 },
      { actorId: 1 },
    ])
      expect(pixelCommand.safeParse({ ...value, ...patch }).success).toBe(
        false,
      );
    expect(chessPalette).toHaveLength(16);
  });
  it("rejects rectangles extending beyond the canvas", () => {
    expect(
      chessAdminCommand.safeParse({
        action: "clear",
        x: 127,
        y: 0,
        width: 2,
        height: 1,
        expectedRevision: 0,
      }).success,
    ).toBe(false);
  });
});
