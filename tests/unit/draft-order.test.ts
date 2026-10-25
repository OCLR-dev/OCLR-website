import { describe, expect, it } from "vitest";
import {
  detectDraftOrder,
  generateTurnSequence,
  initialDraftOrderMode,
  turnSequenceProblem,
} from "../../src/lib/draft-order";
describe("explicit draft order generation", () => {
  it.each([1, 2, 3, 5])(
    "generates alternating and forward rounds for %i captains without mutating their order",
    (count) => {
      const ids = Array.from({ length: count }, (_, i) => String(i));
      for (const rounds of [1, 2, 3, 4]) {
        expect(generateTurnSequence(ids, rounds, "forward")).toEqual(
          Array.from({ length: rounds }, () => ids).flat(),
        );
        expect(generateTurnSequence(ids, rounds, "snake")).toEqual(
          Array.from({ length: rounds }, (_, i) =>
            i % 2 ? [...ids].reverse() : ids,
          ).flat(),
        );
      }
      expect(ids).toEqual(Array.from({ length: count }, (_, i) => String(i)));
    },
  );
  it("repeats the endpoint in a snake and identifies only unambiguous saved modes", () => {
    expect(generateTurnSequence(["A", "B", "C"], 3, "snake")).toEqual([
      "A",
      "B",
      "C",
      "C",
      "B",
      "A",
      "A",
      "B",
      "C",
    ]);
    expect(detectDraftOrder(["A", "B"], ["A", "B", "B", "A"])).toBe("snake");
    expect(detectDraftOrder(["A", "B"], ["A", "B", "A", "B"])).toBe("forward");
    for (const sequence of [[], ["A", "B"], ["B", "A", "A"], ["A", "A"]])
      expect(detectDraftOrder(["A", "B"], sequence)).toBe("custom");
    expect(detectDraftOrder(["A"], ["A", "A"])).toBe("custom");
  });
  it("preselects Snake only while no order is saved and keeps saved modes (#280)", () => {
    const ids = ["A", "B", "C"];
    expect(initialDraftOrderMode(ids, [])).toBe("snake");
    expect(initialDraftOrderMode([], [])).toBe("snake");
    expect(generateTurnSequence(ids, 2, "snake")).toEqual([
      "A",
      "B",
      "C",
      "C",
      "B",
      "A",
    ]);
    expect(
      initialDraftOrderMode(ids, generateTurnSequence(ids, 2, "snake")),
    ).toBe("snake");
    expect(
      initialDraftOrderMode(ids, generateTurnSequence(ids, 2, "forward")),
    ).toBe("forward");
    for (const saved of [
      ["A", "B", "C"],
      ["C", "A", "B"],
      ["A", "A", "B"],
    ])
      expect(initialDraftOrderMode(ids, saved)).toBe("custom");
  });
  it("rejects invalid generation and enforces bounded turns", () => {
    for (const ids of [[], [""], ["A", "A"]])
      expect(() => generateTurnSequence(ids, 1, "snake")).toThrow();
    for (const rounds of [0, -1, 1.5, NaN, Infinity, 4097])
      expect(() => generateTurnSequence(["A"], rounds, "snake")).toThrow();
    expect(generateTurnSequence(["A"], 4096, "forward")).toHaveLength(4096);
  });
  it("checks actual capacities including existing captains, pool sufficiency and custom asymmetric turns", () => {
    const teams = [
      { id: "A", capacity: 2, members: 1 },
      { id: "B", capacity: 4, members: 1 },
    ];
    expect(turnSequenceProblem(["A", "B", "B", "B"], teams, 4)).toBeNull();
    expect(turnSequenceProblem(["A", "A"], teams, 4)).toMatch(/capacity/);
    expect(turnSequenceProblem(["A", "B"], teams, 1)).toMatch(/pool/);
    expect(turnSequenceProblem(["missing"], teams, 4)).toMatch(
      /current edition team/,
    );
    expect(turnSequenceProblem([], teams, 4)).toMatch(/at least one/);
    expect(turnSequenceProblem(["A"], [], 4)).toMatch(/teams first/);
    expect(
      turnSequenceProblem(
        Array(4097).fill("A"),
        [{ id: "A", capacity: null, members: 1 }],
        5000,
      ),
    ).toMatch(/4096/);
    expect(
      turnSequenceProblem(
        ["A", "A"],
        [{ id: "A", capacity: null, members: 1 }],
        2,
      ),
    ).toBeNull();
  });
});
