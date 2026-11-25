import { afterEach, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import {
  restoreLiruHistory,
  saveLiruTurn,
} from "../../src/lib/liru-chat-history";

const pair = (n: number, text = "Answer"): UIMessage[] => [
  {
    id: "q" + n,
    role: "user",
    parts: [{ type: "text", text: "Question " + n }],
  },
  { id: "a" + n, role: "assistant", parts: [{ type: "text", text }] },
];
afterEach(() => vi.unstubAllGlobals());

it("keeps the last 20 completed pairs and replaces a regenerated turn", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key),
    setItem: (key: string, value: string) => store.set(key, value),
  });
  for (let n = 0; n < 21; n++) saveLiruTurn("a", pair(n));
  saveLiruTurn("a", pair(20, "Updated"));
  const restored = restoreLiruHistory("a");
  expect(restored).toHaveLength(40);
  expect(restored[0].id).toBe("q1");
  expect(restored.at(-1)).toEqual(pair(20, "Updated")[1]);
});

it("starts empty with damaged or unavailable storage and can still finish a turn", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => "{",
    setItem: () => {
      throw new Error("quota");
    },
  });
  expect(restoreLiruHistory("x")).toEqual([]);
  expect(() => saveLiruTurn("x", pair(1))).not.toThrow();
});
