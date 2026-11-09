import type { awardWorkspace } from "../../src/lib/award-reads";
import { weeklyStandings, AWARD_POLICY } from "../../src/lib/award-model";

export function syntheticAwardWorkspace(
  count: number,
): Awaited<ReturnType<typeof awardWorkspace>> {
  const weeks = Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    startsAt: `2026-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    endsAt: `2026-11-${String(index + 2).padStart(2, "0")}T00:00:00.000Z`,
  }));
  return {
    edition: { slug: "synthetic", name: "Synthetic awards", timeZone: "UTC" },
    version: 1,
    weeks,
    policy: AWARD_POLICY,
    tiers: [],
    participants: [],
    releases: [],
    roundRatings: [],
    reports: weeklyStandings(weeks, [], []).map((report) => ({
      ...report,
      policy: AWARD_POLICY,
      timeZone: "UTC",
      identities: [],
      fingerprint: String(report.number).repeat(64),
    })),
  };
}
