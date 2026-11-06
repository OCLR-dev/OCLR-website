import { describe, expect, it } from "vitest";
import { previousUsernames } from "../../src/lib/player-aliases";

describe("previous usernames", () => {
  it("merges profile and roster names without duplicates", () => {
    expect(
      previousUsernames(["lp_Blue"], ["lp_Blue", "Muzi"], "Muziyami"),
    ).toEqual(["lp_Blue", "Muzi"]);
  });
  it("drops the current name regardless of case", () => {
    expect(previousUsernames([], ["muziyami", "old"], "Muziyami")).toEqual([
      "old",
    ]);
  });
  it("keeps every alias when the list is longer than five", () => {
    const aliases = ["a", "b", "c", "d", "e", "f"];
    expect(previousUsernames(aliases, [], "current")).toEqual(aliases);
  });
});
