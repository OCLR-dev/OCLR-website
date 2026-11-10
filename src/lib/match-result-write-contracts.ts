import { fixtureStatuses } from "./fixture-status";
import { z } from "zod";
import { exhibitionSidesSchema } from "./exhibition-sides";
import type { FixtureReadContracts } from "./fixture-read-contracts";
import { gameDecisionSchema, matchSourceSchema } from "./match-model";
import { defaultJsonBodyLimit } from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

const common = {
  requestKey: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  expectedFixtureVersion: z.number().int().nonnegative(),
  confirmed: z.literal(true),
};
const importRequest = z
  .object({
    ...common,
    match: z.string().trim().min(1).max(250),
    completion: z
      .object({
        homeTeamId: z.uuid(),
        awayTeamId: z.uuid(),
        sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
const resultRequest = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("submit"),
      importId: z.uuid(),
      rulesConfirmed: z.literal(true).optional(),
      sourceChangesConfirmed: z.literal(true),
      decisions: z.array(gameDecisionSchema).max(3000),
      publicNote: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("approve"),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("approve_publish"),
      revision: z.number().int().positive(),
      progressionAcknowledged: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("reject"),
      decisionNote: z.string().trim().min(1).max(1000),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("publish"),
      revision: z.number().int().positive(),
      progressionAcknowledged: z.literal(true),
    })
    .strict(),
  z.object({ ...common, action: z.literal("unpublish") }).strict(),
  z
    .object({
      ...common,
      action: z.literal("void"),
      decisionNote: z.string().trim().min(1).max(1000),
      progressionAcknowledged: z.literal(true),
    })
    .strict(),
]);

const revision = z.number().int().nonnegative();
const nullableId = z.uuid().nullable();
const instant = z.iso.datetime().nullable();
const outcome = z.enum(["winner", "loser"]).nullable();
const identity = z.object({ osuId: z.number(), username: z.string() });
const matchPreview = z.object({
  source: matchSourceSchema,
  teams: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      captainId: z.number(),
      members: z.array(identity),
      unpublished: z.boolean().optional(),
    }),
  ),
  attribution: z.array(
    z.object({ osuId: z.number(), teamIds: z.array(z.uuid()) }),
  ),
  fixture: z.object({
    id: z.uuid(),
    editionSlug: z.string(),
    roundId: z.uuid(),
    label: z.string(),
    homeTeamId: nullableId,
    awayTeamId: nullableId,
    scheduledAt: instant,
    timeZone: z.string(),
    status: z.enum(fixtureStatuses),
    mappoolId: nullableId,
    position: z.number(),
    homeSourceId: nullableId,
    homeSourceOutcome: outcome,
    awaySourceId: nullableId,
    awaySourceOutcome: outcome,
    publishedAt: instant,
    assignmentRevision: revision,
    streamRevision: revision,
    version: revision,
    updatedAt: z.iso.datetime(),
    referees: z.array(identity),
    refereeIds: z.array(z.number()),
    result: z
      .object({
        fixtureId: z.uuid(),
        state: z.enum(["draft", "approved", "submitted"]),
        version: revision,
        currentRevision: revision,
        latestImportId: nullableId,
        publishedRevision: revision.nullable(),
        publishedAt: instant,
      })
      .nullable(),
    exhibitionSides: exhibitionSidesSchema.optional(),
  }),
  suggested: z.object({ homeTeamId: nullableId, awayTeamId: nullableId }),
  unique: z.boolean(),
  expectedFixtureVersion: revision,
  expectedVersion: revision,
});

export type MatchImportPreviewResponse = z.output<typeof matchPreview>;
export type FixtureMatchPreview = Omit<
  MatchImportPreviewResponse,
  "fixture"
> & {
  fixture: FixtureReadContracts["staffFixtures"]["fixtures"][number];
};

const base = "/api/admin/tournaments/{edition}/matches/{fixtureId}";
const browserPost = {
  method: "POST",
  access: "browser",
  successStatus: 200,
  parameters: { fixtureId: z.uuid() },
} as const;
const commonErrors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, assignment, or edition capability rejected.",
  404: "The fixture or related resource was not found.",
  500: "Unexpected failure.",
  503: "Site origin configuration is unavailable or invalid.",
};
const providerErrors = {
  ...commonErrors,
  413: "The JSON body or upstream match history exceeds its size limit.",
  429: "The osu! lookup is rate limited.",
  502: "osu! returned unavailable or invalid match data.",
  503: "Site or osu! provider configuration is unavailable, or the import time budget was reached.",
  504: "The osu! lookup timed out.",
};

export const importMatchResultWrite = {
  ...browserPost,
  id: "importMatchResult",
  path: `${base}/imports`,
  maxBodyBytes: defaultJsonBodyLimit,
  request: importRequest,
  summary: "Import multiplayer source evidence for a fixture",
  description:
    "Requires record_results and fixture access. The optional participant completion requires manage_fixtures and the source fingerprint from preview. The import checks fixture and result versions, saves evidence without publishing, and replays an identical request key without another provider call or write.",
  successDescription: "The current private match review workspace.",
  response: { readResource: "matchReview" },
  errors: {
    ...providerErrors,
    400: "Invalid command or multiplayer ID or URL.",
    409: "The fixture, result version, source fingerprint, or request key conflicts with current state.",
  },
  consumers: [
    "src/components/match-review.tsx",
    "src/components/match-source-completion.tsx",
  ],
} as const satisfies WriteApiOperation;

export const previewMatchImportWrite = {
  ...browserPost,
  id: "previewMatchImport",
  path: `${base}/imports/preview`,
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.strictObject({ match: z.string().trim().min(1).max(250) }),
  summary: "Preview multiplayer evidence and participant attribution",
  description:
    "Requires record_results and fixture access. Fetches official match evidence, then rechecks access. The preview reports current versions, attribution and suggested participants. It does not create an import or publish a result.",
  successDescription:
    "Match evidence, scoped teams, fixture, attribution and suggested participants.",
  response: matchPreview,
  errors: {
    ...providerErrors,
    400: "Invalid multiplayer ID or URL.",
    409: "The fixture is cancelled.",
  },
  consumers: ["src/components/match-source-completion.tsx"],
} as const satisfies WriteApiOperation;

export const changeMatchResultWrite = {
  ...browserPost,
  id: "changeMatchResult",
  path: `${base}/results`,
  maxBodyBytes: 512 * 1024,
  request: resultRequest,
  summary: "Review, approve, publish, withdraw or void a result",
  description:
    "Submitting requires record_results. Approval, rejection and void require approve_results. Publishing or unpublishing requires publish_results, and approve_publish requires both approval and publication grants. Commands check fixture and result versions and replay identical requests. Publication and void require explicit acknowledgement of progression effects.",
  successDescription: "The current private match review workspace.",
  response: { readResource: "matchReview" },
  errors: {
    ...commonErrors,
    400: "Invalid command, incomplete review, or invalid game decisions.",
    409: "The fixture, result revision, reviewed evidence, publication dependencies, or request key conflicts with current state.",
  },
  consumers: ["src/components/match-review.tsx"],
} as const satisfies WriteApiOperation;
