import { afterEach, expect, it, vi } from "vitest";
import { chatWrite } from "../../src/lib/chat-write-contract";
import {
  chatTurnContext,
  rememberCompletedAnswer,
} from "../../src/lib/chat-turn-context";
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
  const longAnswer = "Updated ".repeat(4000);
  saveLiruTurn("a", pair(20, longAnswer));
  const restored = restoreLiruHistory("a");
  expect(restored).toHaveLength(40);
  expect(restored[0].id).toBe("q1");
  expect(restored.at(-1)).toEqual(pair(20, longAnswer)[1]);
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

it("aligns completed answer excerpts to the previous three questions and excludes unfinished text", () => {
  const completed = new Map<string, string>();
  const pairs = Array.from({ length: 5 }, (_, i) => pair(i, "x".repeat(2050)));
  pairs.forEach(([q, a], i) => {
    if (i !== 2) rememberCompletedAnswer(completed, q, a);
  });
  const context = chatTurnContext(pairs.flat(), completed);
  expect(context.questions).toEqual([
    "Question 1",
    "Question 2",
    "Question 3",
    "Question 4",
  ]);
  expect(context.previousAnswers).toEqual([
    "x".repeat(2000),
    null,
    "x".repeat(2000),
  ]);
  const body = { edition: "s11", locale: "en", ...context };
  expect(chatWrite.request.safeParse(body).success).toBe(true);
  expect(
    chatWrite.request.safeParse({ ...body, previousAnswers: ["mismatched"] })
      .success,
  ).toBe(false);
  expect(
    chatWrite.request.safeParse({
      ...body,
      previousAnswers: ["x".repeat(2001), null, null],
    }).success,
  ).toBe(false);
});
