import { z } from "zod";
import { appearances } from "./preferences";
import { auditModules } from "./read-api-queries";

function literalChoices<const Values extends readonly string[]>(
  values: Values,
) {
  return values.map((value: Values[number]) => z.literal(value));
}

const nullableString = z.union([z.null(), z.string()]);
const nullableNumber = z.union([z.null(), z.number()]);
const statuses = literalChoices([
  "pending",
  "deferred",
  "accepted",
  "rejected",
  "withdrawn",
]);
const registration = {
  userId: z.number(),
  editionSlug: z.string(),
  status: z.union(statuses),
};
const timestamps = { createdAt: z.date(), updatedAt: z.date() };
const settingSchema = <Appearance extends z.ZodType, Updated extends z.ZodType>(
  appearance: Appearance,
  updatedAt: Updated,
) =>
  z.strictObject({
    id: z.number(),
    defaultAppearance: appearance,
    revision: z.number(),
    updatedAt,
  });
const contributor = { name: z.string(), osuId: z.number() };
const grant = {
  role: z.union(
    literalChoices([
      "referee",
      "streamer",
      "mapper",
      "admin",
      "mappooler",
      "developer",
      "tester",
      "replayer",
      "designer",
      "commentator",
    ]),
  ),
  editionSlug: nullableString,
};
const nullableScope = z.union([z.null(), z.array(z.string())]);

export const siteRegistrationReadContracts = {
  ownEligibility: z.union([
    z.null(),
    z.strictObject({
      rankGraceRange: z
        .strictObject({ minRank: z.number(), maxRank: z.number() })
        .optional(),
      userId: z.number(),
      mode: z.literal("osu"),
      source: z.literal("osu-api-v2"),
      configurationVersion: z.number(),
      status: z.union(
        literalChoices(["unavailable", "pass", "fail", "staff_override"]),
      ),
      pp: nullableNumber,
      rank: nullableNumber,
      fetchedAt: nullableString,
      checkedAt: z.string(),
      limits: z.strictObject({
        minPp: nullableNumber,
        maxPp: nullableNumber,
        minRank: nullableNumber,
        maxRank: nullableNumber,
      }),
      comparisons: z.array(
        z.strictObject({
          field: z.union(
            literalChoices(["minPp", "maxPp", "minRank", "maxRank"]),
          ),
          limit: z.number(),
          value: nullableNumber,
          passed: z.union([z.null(), z.literal(false), z.literal(true)]),
        }),
      ),
    }),
  ]),
  tournamentList: z.strictObject({
    canCreate: z.boolean(),
    rows: z.array(
      z.strictObject({
        slug: z.string(),
        name: z.string(),
        season: nullableString,
        status: z.union(literalChoices(["upcoming", "live", "completed"])),
        published: z.boolean(),
        registrationState: z.string(),
        registration: z.union([
          z.null(),
          z.strictObject({ opensAt: z.string(), closesAt: z.string() }),
        ]),
        timeZone: z.string(),
        updatedAt: z.date(),
        links: z.array(
          z.strictObject({
            href: z.string(),
            label: z.string(),
            group: z.string(),
            exact: z.boolean(),
          }),
        ),
      }),
    ),
  }),
  staffAccess: z.array(z.strictObject(grant)),
  listStaffRoles: z.strictObject({
    grants: z.array(
      z.strictObject({
        grant: z.strictObject({
          id: z.string(),
          userId: z.number(),
          editionSlug: grant.editionSlug,
          role: grant.role,
          grantedBy: z.number(),
          grantedAt: z.date(),
          revokedAt: z.union([z.null(), z.date()]),
          aboutPublished: z.boolean(),
        }),
        username: z.string(),
      }),
    ),
    scopes: nullableScope,
    writeScopes: nullableScope,
  }),
  auditLog: z.strictObject({
    rows: z.array(
      z.strictObject({
        id: z.string(),
        edition: nullableString,
        actorId: z.union([z.null(), z.number()]),
        username: nullableString,
        action: z.string(),
        module: z.string(),
        entityType: z.string(),
        entityId: z.string(),
        timestamp: z.string(),
        before: z.unknown(),
        after: z.unknown(),
        details: z.unknown(),
      }),
    ),
    total: z.number(),
    filters: z.strictObject({
      edition: z.string(),
      actor: z.string(),
      action: z.string(),
      module: z.union(literalChoices(["", ...auditModules])),
      from: z.string(),
      to: z.string(),
      page: z.number(),
    }),
  }),
  publicContributors: z.array(z.strictObject(contributor)),
  contributorsForAdmin: z.strictObject({
    id: z.number(),
    entries: z.array(
      z.strictObject({
        id: z.string(),
        ...contributor,
        published: z.boolean(),
      }),
    ),
    revision: z.number(),
  }),
  siteSettingsForAdmin: z.union([
    settingSchema(z.union(literalChoices(appearances)), z.date()),
    settingSchema(z.literal("default"), z.null()),
  ]),
  publicEnrollmentState: z.union(
    literalChoices([
      "upcoming",
      "paused",
      "unavailable",
      "closed",
      "unannounced",
      "open",
    ]),
  ),
  ownRegistrations: z.array(
    z.strictObject({
      id: z.string(),
      lastOperation: z.union([
        z.null(),
        ...literalChoices([
          "staff_remove",
          "staff_restore",
          "player_withdraw",
          "player_reapply",
        ]),
      ]),
      ...registration,
      source: z.union(literalChoices(["player", "staff"])),
      attempt: z.number(),
      rulesVersion: nullableString,
      eligibilityAcknowledged: z.union([
        z.null(),
        z.literal(false),
        z.literal(true),
      ]),
      configurationVersion: z.union([z.null(), z.number()]),
      answers: z.record(z.string(), z.string()),
      statusReason: nullableString,
      ...timestamps,
    }),
  ),
  listApplications: z.strictObject({
    rows: z.array(
      z.strictObject({
        id: z.string(),
        userId: registration.userId,
        username: z.string(),
        editionSlug: registration.editionSlug,
        status: registration.status,
        ...timestamps,
      }),
    ),
    total: z.number(),
    filters: z.strictObject({
      q: z.string(),
      edition: z.string(),
      status: z.union([z.literal(""), ...statuses, z.literal("active")]),
      page: z.number(),
    }),
  }),
} as const;
