import { roles, type StaffRole } from "./staff-role-model";

export const demoEdition = "dev-s11";
export const demoPlayerBase = 8_000_000_000_000;
export const localRolePreviewPath = "/dev/roles";
export const localRolePreviewAction = "/auth/dev-role";

export const demoPlayers = Array.from({ length: 28 }, (_, index) => ({
  osuId: demoPlayerBase + index + 1,
  username: `Demo_${String(index + 1).padStart(2, "0")}`,
}));

const demoStaffOffsets = {
  admin: 201,
  mappooler: 202,
  referee: 203,
  developer: 204,
  streamer: 205,
  tester: 206,
  replayer: 207,
  designer: 208,
  commentator: 209,
  mapper: 210,
} satisfies Record<StaffRole, number>;

export const demoStaff = roles.map((role) => ({
  role,
  osuId: demoPlayerBase + demoStaffOffsets[role],
  username: `Demo_${role}`,
}));

export const demoVisitor = {
  osuId: demoPlayerBase + 300,
  username: "Demo_NewPlayer",
};

export const localRolePreviewAccounts = [
  ...demoStaff,
  ...demoPlayers,
  demoVisitor,
];
