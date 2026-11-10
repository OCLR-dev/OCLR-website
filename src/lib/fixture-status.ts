export const fixtureStatuses = [
  "scheduled",
  "in_progress",
  "cancelled",
  "ended",
] as const;

export type FixtureStatus = (typeof fixtureStatuses)[number];

export function isActiveFixtureStatus(status: FixtureStatus) {
  return status === "scheduled" || status === "in_progress";
}
