import { expect, it } from "vitest";
import { chatAnalysisIntent } from "@/lib/chat-analysis-intent";

it("recognizes localized technical prompts and explicit inputs", () => {
  expect(
    chatAnalysisIntent("用 BID ３７８６８１０ 和 MOD NM 找相似譜面", ""),
  ).toEqual({
    kind: "beatmap",
    bid: 3786810,
    mod: "NM",
  });
  expect(
    chatAnalysisIntent(
      "Find similar maps to https://osu.ppy.sh/beatmapsets/1#osu/3786810 with DT+HD",
      "",
    ),
  ).toEqual({
    kind: "beatmap",
    bid: 3786810,
    mod: "HDDT",
  });
  expect(
    chatAnalysisIntent("查 UID 10260284 的技术强弱和练习推荐", ""),
  ).toEqual({
    kind: "player",
    uid: 10260284,
  });
});

it("asks for ambiguous inputs and keeps technical follow-ups separate from existing lookup intents", () => {
  expect(chatAnalysisIntent("BID 1 BID 2 MOD HR 找相似譜面", "")).toMatchObject(
    {
      kind: "beatmap",
      bid: undefined,
      mod: "HR",
    },
  );
  expect(chatAnalysisIntent("BID 3786810 MOD FM", "")).toMatchObject({
    kind: "beatmap",
    mod: undefined,
  });
  expect(chatAnalysisIntent("DT", "相似譜面 BID 3786810")).toEqual({
    kind: "beatmap",
    bid: 3786810,
    mod: "DT",
  });
  expect(chatAnalysisIntent("UID: 10260284", "推薦練習譜面")).toEqual({
    kind: "player",
    uid: 10260284,
  });
  expect(chatAnalysisIntent("UID 10260284", "賽程")).toBeUndefined();
  expect(chatAnalysisIntent("BID 3786810 MOD NM 相似背景", "")).toBeUndefined();
  expect(chatAnalysisIntent("UID 10260284 的 SIP skills", "")).toBeUndefined();
  expect(
    chatAnalysisIntent("推薦有 HD 強項的選秀隊員 UID 10260284", ""),
  ).toBeUndefined();
});
