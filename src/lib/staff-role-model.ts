export const roles = [
  "admin",
  "mappooler",
  "referee",
  "developer",
  "streamer",
  "tester",
  "replayer",
  "designer",
  "commentator",
  "mapper",
] as const;

export type StaffRole = (typeof roles)[number];
