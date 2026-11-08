import { z } from "zod";
import { resolveArchiveStaffCommand } from "./archive-staff-identity-model";
import { editionSchema, editionSlugSchema } from "./editions";
import {
  archivePlayerExchangeConfirmation,
  archiveSubstituteConfirmation,
} from "./historical-archive";
import { defaultJsonBodyLimit } from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

const shape = editionSchema.shape;
const identity = {
  name: shape.name,
  season: shape.season,
  summary: shape.summary,
  timeZone: shape.timeZone,
  branding: shape.branding,
  defaultAppearance: shape.defaultAppearance,
};
const version = {
  expectedRevision: z.number().int().nonnegative(),
  confirmed: z.literal(true),
};
const createSchema = z
  .object({
    ...identity,
    slug: shape.slug
      .refine((s) => s !== "new", "This slug is reserved")
      .optional(),
    summary: shape.summary.default(""),
    timeZone: shape.timeZone.default("UTC"),
    confirmed: z.literal(true),
  })
  .strict();
const commandSchema = z.discriminatedUnion("action", [
  resolveArchiveStaffCommand,
  archivePlayerExchangeConfirmation
    .extend({
      ...version,
      action: z.literal("exchange-archive-players"),
      preserveStatistics: z.literal(true),
    })
    .strict(),
  archiveSubstituteConfirmation
    .extend({
      ...version,
      action: z.literal("add-archive-substitute"),
      preserveStatistics: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("resolve-archive-identity"),
      unresolvedId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
      osuId: z.number().int().positive().max(2147483647),
      source: z.string().trim().min(1).max(160),
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("approve-archive-matches"),
      matchIds: z.array(z.string().min(1).max(80)).min(1).max(500),
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("archive"),
      archive: shape.archive.unwrap(),
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("enrollment"),
      paused: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("general"),
      ...identity,
      status: shape.status,
      coachesEnabled: shape.coachesEnabled,
      ezScoreMultiplier: shape.ezScoreMultiplier,
      rosterCapacity: shape.rosterCapacity,
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("rules"),
      rules: shape.rules,
      eligibility: shape.eligibility,
      automaticEligibility: shape.automaticEligibility,
      rankGraceRange: shape.rankGraceRange,
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("registration"),
      registration: shape.registration,
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("schedule"),
      schedule: shape.schedule,
    })
    .strict(),
  z
    .object({
      ...version,
      action: z.literal("publication"),
      published: z.boolean(),
    })
    .strict(),
]);
const path = "/api/admin/tournaments";
const editor = "src/components/tournament-editor.tsx";
const editionParameter = { edition: editionSlugSchema };
const workspace = { readResource: "tournamentForAdmin" } as const;
const errors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, or current configuration permission rejected.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};

export const createTournamentWrite = {
  id: "createTournament",
  path,
  method: "POST",
  access: "browser",
  maxBodyBytes: defaultJsonBodyLimit,
  request: createSchema,
  summary: "Create an unpublished tournament draft",
  description:
    "Requires global configure_tournament and confirmation. A name alone can supply the default slug; new is reserved. The new draft starts unpublished at revision zero. Its slug is permanent. An existing or retired slug conflicts. Check the tournament list before retrying an uncertain response.",
  successStatus: 201,
  successDescription: "The private admin workspace for the new tournament.",
  response: workspace,
  errors: {
    ...errors,
    400: "Invalid tournament identity or configuration.",
    409: "The tournament slug already exists.",
  },
  consumers: [editor],
} as const satisfies WriteApiOperation;

export const changeTournamentWrite = {
  id: "changeTournament",
  path: `${path}/{edition}`,
  method: "POST",
  access: "browser",
  parameters: editionParameter,
  maxBodyBytes: 512 * 1024,
  request: commandSchema,
  summary: "Change tournament settings or correct historical archive evidence",
  description:
    "Requires configure_tournament for the selected edition, explicit confirmation and the current configuration revision. Registration enablement, operational pause and tournament visibility have separate commands. Archive corrections require eligible saved history. Historical staff linking rechecks the verified provider ID and records the confirmation source without creating a role grant. A save with no change at the current revision creates no audit event. A committed change and its audit entry are transactional.",
  successStatus: 200,
  successDescription: "The saved private tournament admin workspace and revision.",
  response: workspace,
  errors: {
    ...errors,
    400: "Invalid command or resulting tournament configuration.",
    404: "The tournament or verified provider identity was not found.",
    409: "Revision, publication, registration, draft lock, or archive evidence conflicts with current state.",
    429: "Provider lookup is rate limited or busy.",
    502: "The provider returned an invalid response or could not be reached.",
    503: "Site configuration or a current verified provider profile is unavailable.",
  },
  consumers: [
    editor,
    "src/components/archive-importer.tsx",
    "src/components/archive-player-exchange.tsx",
    "src/components/archive-staff-resolver.tsx",
    "src/components/archive-substitute.tsx",
  ],
} as const satisfies WriteApiOperation;

export const deleteTournamentDraftWrite = {
  id: "deleteTournamentDraft",
  path: `${path}/{edition}/delete-draft`,
  method: "POST",
  access: "browser",
  parameters: editionParameter,
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.strictObject({
    expectedRevision: version.expectedRevision,
    confirmSlug: editionSlugSchema,
    confirmed: version.confirmed,
  }),
  summary: "Retire an unused blank tournament draft",
  description:
    "Requires global configure_tournament, the exact draft slug and the current revision. Any existing tournament data, staff history or nonblank current or earlier revision prevents deletion. The draft disappears from readers while its slug and history remain reserved. A repeat returns not found.",
  successStatus: 200,
  successDescription: "Confirmation that the draft was retired.",
  response: z.strictObject({ deleted: z.literal(true), slug: editionSlugSchema }),
  errors: {
    ...errors,
    400: "Invalid command or confirmation slug.",
    404: "The active draft was not found.",
    409: "Revision or current and historical draft eligibility conflict.",
  },
  consumers: [editor],
} as const satisfies WriteApiOperation;

export type CreateTournamentInput = z.input<typeof createTournamentWrite.request>;
export type TournamentSettingsInput = z.input<typeof changeTournamentWrite.request>;
export type DeleteTournamentDraftInput = z.input<
  typeof deleteTournamentDraftWrite.request
>;
