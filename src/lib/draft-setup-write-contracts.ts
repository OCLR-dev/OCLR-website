import { z } from "zod";
import {
  defaultJsonBodyLimit,
  draftCommandBodyLimit,
  TEAM_IMAGE_MAX_BYTES,
} from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const commands = z.discriminatedUnion("action", [
  z.object({ action: z.literal("appoint"), userId: id }).strict(),
  z.object({ action: z.literal("revoke"), userId: id }).strict(),
  z
    .object({ action: z.literal("replace"), userId: id, previousUserId: id })
    .strict(),
  z
    .object({
      action: z.literal("order"),
      userIds: z.array(id).min(1).max(256),
    })
    .strict(),
  z
    .object({
      action: z.literal("availability"),
      userId: id,
      available: z.boolean(),
      unavailableExplanation: z.string().trim().min(1).max(1000).optional(),
    })
    .strict(),
  z.object({ action: z.literal("lock") }).strict(),
  z
    .object({
      action: z.literal("publish"),
      published: z.boolean(),
      poolPublished: z.boolean(),
    })
    .strict(),
]);
const captainCommand = z
  .object({
    command: commands,
    expectedVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  })
  .strict();

const teamInput = z
  .object({
    captainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    name: z.string().trim().min(1).max(80),
    capacity: z.number().int().min(1).max(256).nullable(),
  })
  .strict();
const teamCommand = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
    command: z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("add_coach"),
          teamId: z.uuid(),
          userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        })
        .strict(),
      z
        .object({
          action: z.literal("remove_coach"),
          teamId: z.uuid(),
          userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        })
        .strict(),
      z
        .object({
          action: z.literal("configure"),
          teams: z.array(teamInput).min(1).max(256),
        })
        .strict(),
      z
        .object({
          action: z.literal("edit"),
          teamId: z.uuid(),
          name: teamInput.shape.name,
          capacity: teamInput.shape.capacity,
          avatarKey: z.uuid().nullable(),
        })
        .strict(),
      z
        .object({
          action: z.literal("publish"),
          teamId: z.uuid(),
          identityPublished: z.boolean(),
          rosterPublished: z.boolean(),
        })
        .strict(),
    ]),
  })
  .strict();

const draftCommand = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
    command: z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("configure"),
          expectedSetupVersion: z.number().int().nonnegative(),
          turnSequence: z.array(z.uuid()).max(4096),
        })
        .strict(),
      ...(["unlock", "reset"] as const).map((action) =>
        z
          .object({
            action: z.literal(action),
            expectedSetupVersion: z.number().int().nonnegative(),
          })
          .strict(),
      ),
      ...(
        [
          "ready",
          "start",
          "pause",
          "resume",
          "publish",
          "undo",
          "abort",
          "recover",
          "finalize",
        ] as const
      ).map((action) => z.object({ action: z.literal(action) }).strict()),
    ]),
  })
  .strict();

const pickInput = z
  .object({
    sessionId: z.uuid(),
    turnIndex: z.number().int().nonnegative(),
    candidateId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.uuid(),
  })
  .strict();

const browser = { access: "browser", successStatus: 200 } as const;
const jsonPost = {
  ...browser,
  method: "POST",
  maxBodyBytes: defaultJsonBodyLimit,
} as const;
const path = "/api/admin/tournaments/{edition}";
const commonErrors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, or edition capability rejected.",
  404: "The edition or accessible target was not found.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};
const setupConflict =
  "The setup revision or current edition state prevents the change.";

export const changeCaptainsWrite = {
  ...jsonPost,
  id: "changeCaptains",
  path: `${path}/captains`,
  request: captainCommand,
  summary: "Manage edition captain appointments and draft eligibility",
  description:
    "Requires manage_captains, confirmation and the current setup version. Appointment, replacement and revocation check accepted registrations and active competition dependencies. Setup locking and publication remain explicit commands.",
  successDescription: "The current captain setup workspace.",
  response: { readResource: "captainSetup" },
  errors: {
    ...commonErrors,
    400: "Invalid command or missing unavailability explanation.",
    409: setupConflict,
  },
  consumers: ["src/components/captain-manager.tsx"],
} as const satisfies WriteApiOperation;

export const changeTeamsWrite = {
  ...jsonPost,
  id: "changeTeams",
  path: `${path}/teams`,
  request: teamCommand,
  summary: "Configure teams, coaches and publication",
  description:
    "Requires manage_teams, confirmation and the current setup version. Team identity and roster publication are checked separately. The JSON edit command can keep or clear an avatar. A new avatar is uploaded through the team identity endpoint. Adding a coach requires a verified current osu! profile.",
  successDescription: "The current staff teams workspace.",
  response: { readResource: "staffTeams" },
  errors: {
    ...commonErrors,
    400: "Invalid command, team configuration or image reference.",
    409: setupConflict,
    429: "osu! lookup is rate limited.",
    502: "The upstream osu! response was unavailable or invalid.",
    503: "Site or verified osu! profile is unavailable.",
    504: "The osu! lookup timed out.",
  },
  consumers: [
    "src/app/admin/tournaments/[edition]/teams/page.tsx",
    "src/components/team-manager.tsx",
    "src/components/team-coach-manager.tsx",
  ],
} as const satisfies WriteApiOperation;

const teamIdentityFields = z.looseObject({
  name: teamInput.shape.name,
  expectedVersion: z
    .string()
    .optional()
    .describe(
      "Setup version converted with Number. An omitted field is treated as zero.",
    ),
  removeAvatar: z
    .string()
    .optional()
    .describe(
      "The literal true removes the current avatar unless a replacement file is supplied.",
    ),
});

export const editTeamIdentityWrite = {
  ...browser,
  id: "editTeamIdentity",
  path: `${path}/teams/{teamId}`,
  method: "PATCH",
  parameters: { teamId: z.uuid() },
  requestMediaType: "multipart/form-data",
  maxBodyBytes: TEAM_IMAGE_MAX_BYTES + 8192,
  request: teamIdentityFields.extend({
    image: z
      .file()
      .max(TEAM_IMAGE_MAX_BYTES)
      .optional()
      .describe(
        "Optional static JPEG, PNG or WebP up to 5 MiB and 4096 × 4096 pixels. An empty file is ignored.",
      ),
  }),
  urlencodedRequest: teamIdentityFields,
  summary: "Edit a team name and optionally replace or remove its avatar",
  description:
    "Requires manage_teams and the current setup version. An image file takes precedence over removal. Team capacity is retained. Text-only edits can be submitted as URL-encoded form data.",
  successDescription: "The current staff teams workspace.",
  response: { readResource: "staffTeams" },
  errors: {
    ...commonErrors,
    400: "Missing body or invalid team name, version or image.",
    409: setupConflict,
    413: "The complete request body exceeds its byte limit.",
    500: "The form could not be decoded, storage failed, or an unexpected failure occurred.",
  },
  consumers: ["src/components/team-editor.tsx"],
} as const satisfies WriteApiOperation;

export const changeDraftWrite = {
  ...jsonPost,
  id: "changeDraft",
  path: `${path}/draft`,
  maxBodyBytes: draftCommandBodyLimit,
  request: draftCommand,
  summary: "Configure or transition an edition draft session",
  description:
    "Requires manage_draft and the current draft version. Configure, unlock and reset also check the setup version. Unlock and reset require configure_tournament. Draft transitions and publication enforce current session state and the relevant roster and identity prerequisites.",
  successDescription: "The current private staff draft workspace.",
  response: { readResource: "staffDraft" },
  errors: {
    ...commonErrors,
    409: "The setup, draft revision or operational state prevents the command.",
  },
  consumers: [
    "src/components/draft-order-editor.tsx",
    "src/components/staff-draft.tsx",
  ],
} as const satisfies WriteApiOperation;

export const pickPlayerWrite = {
  ...jsonPost,
  id: "pickDraftPlayer",
  path: "/api/tournaments/{edition}/draft/picks",
  request: pickInput,
  summary: "Pick an eligible player on the current draft turn",
  description:
    "Requires the active captain or staff authorized to pick on their behalf. The server checks the live session, turn, revision, roster capacity and available pool. A matching idempotency key and payload for the same session and actor returns the existing pick with its current correction state and public version.",
  successDescription:
    "Pick identity, turn, player, team, correction flag and public version.",
  response: z.object({
    pickId: z.uuid(),
    turnIndex: z.number().int().nonnegative(),
    teamId: z.uuid(),
    playerId: id,
    corrected: z.boolean(),
    publicVersion: z.number().int().nonnegative(),
  }),
  errors: {
    ...commonErrors,
    403: "Origin, authentication channel, appointment, capability or current turn rejected.",
    409: "The session, turn or revision changed, the player is unavailable, the team is full, or the key was reused for a different payload.",
  },
  consumers: ["src/components/draft-pick.tsx"],
} as const satisfies WriteApiOperation;

export type PickPlayerReceipt = z.output<typeof pickPlayerWrite.response>;
