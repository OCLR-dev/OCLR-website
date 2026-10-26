import { z } from "zod";
import { editionSchema } from "./editions";

export const staffApplicationFilters = z
  .object({
    q: z.string().trim().max(100).default(""),
    edition: z
      .string()
      .regex(/^[a-z0-9-]*$/)
      .max(80)
      .default(""),
    status: z
      .enum([
        "active",
        "",
        "pending",
        "deferred",
        "accepted",
        "rejected",
        "withdrawn",
      ])
      .default("active"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();

export const auditModules = [
  "site",
  "tournament",
  "registrations",
  "captains",
  "teams",
  "draft",
  "mappools",
  "staff",
  "fixtures",
  "results",
  "developer_api",
] as const;
export const auditFilters = z
  .object({
    edition: z
      .string()
      .regex(/^[a-z0-9-]*$/)
      .max(80)
      .default(""),
    actor: z
      .string()
      .regex(/^(?:[1-9]\d*)?$/)
      .refine((v) => !v || Number.isSafeInteger(Number(v)))
      .default(""),
    action: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9_ -]*$/)
      .default(""),
    module: z.enum(["", ...auditModules]).default(""),
    from: z.union([z.literal(""), z.iso.date()]).default(""),
    to: z.union([z.literal(""), z.iso.date()]).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "End date must follow start date",
  );

export const streamingFilters = z
  .object({
    date: z.iso.date().or(z.literal("")).default(""),
    round: z.uuid().or(z.literal("")).default(""),
    view: z.enum(["all", "unassigned", "mine"]).default("all"),
  })
  .strict();

export const collectionQuery = z
  .object({
    q: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    version: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

/** Same request schemas drive service validation, the v1 boundary and OpenAPI parameters. */
export function readQuerySchema(id: string, keys: readonly string[]) {
  if (id === "publicPlayerParticipation")
    return z.object({ edition: editionSchema.shape.slug.optional() }).strict();
  if (
    [
      "listPublicTournaments",
      "listPublicPlayers",
      "listStaffTournaments",
    ].includes(id)
  )
    return collectionQuery;
  if (id === "staffBws")
    return z.object({ mode: z.literal("osu").default("osu") }).strict();
  if (id === "listApplications") return staffApplicationFilters;
  if (id === "auditLog") return auditFilters;
  if (id === "streamingWorkspace")
    return streamingFilters.extend({ fixtureId: z.uuid().optional() });
  if (["statisticsWorkspace", "publicArchiveStatistics"].includes(id))
    return z
      .object({
        fixtureId: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
          .or(z.literal(""))
          .default(""),
      })
      .strict();
  const fields: Record<string, z.ZodType> = {};
  for (const key of keys) {
    if (key === "mode")
      fields[key] = z.enum(["osu", "taiko", "fruits", "mania"]).default("osu");
    else if (key === "locale")
      fields[key] = z.enum(["zh-Hans", "zh-Hant", "en"]).default("en");
    else if (["poolId", "fixtureId"].includes(key))
      fields[key] = z.uuid().optional();
    else throw new Error("Missing read query schema: " + id + "/" + key);
  }
  return z.object(fields).strict();
}
