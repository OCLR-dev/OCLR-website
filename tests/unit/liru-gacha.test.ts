import { expect, it } from "vitest";
import { liruGachaDay, rollLiruRarity } from "../../src/lib/liru-gacha";

it("allocates all random outcomes with the requested rates and last-card guarantee", () => {
  function count(guaranteed: boolean) {
    const counts = { UR: 0, SSR: 0, SR: 0, R: 0 };
    for (let roll = 0; roll < 100; roll++) {
      counts[rollLiruRarity(roll, guaranteed)]++;
    }
    return counts;
  }
  expect(count(false)).toEqual({ UR: 4, SSR: 6, SR: 20, R: 70 });
  expect(count(true)).toEqual({ UR: 4, SSR: 6, SR: 90, R: 0 });
});

it("starts a new draw day at UTC+8 midnight, even before UTC midnight", () => {
  expect(liruGachaDay(new Date("2026-11-18T15:59:59.999Z"))).toBe("2026-11-18");
  expect(liruGachaDay(new Date("2026-11-18T16:00:00.000Z"))).toBe("2026-11-19");
});
