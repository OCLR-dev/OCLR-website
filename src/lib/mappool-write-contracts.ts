import { z } from "zod";
import { downloadMirrorSchema } from "./mappool-download";
import {
  categories,
  difficultyConfigurations,
  type BeatmapMetadata,
} from "./mappool-model";
import { skillsetTags } from "./mappool-skillsets";
import { candidateCategories, commentLength } from "./mappool-workbench-model";
import { defaultJsonBodyLimit } from "./request-body-limits";
import type { WriteApiOperation } from "./write-api-contract";

const confirmation = {
  confirmed: z.literal(true),
};
const versioned = {
  poolId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
};
const name = z.string().trim().min(1).max(80);
const position = z.number().int().min(1).max(999);
const batchIds = z
  .array(z.uuid())
  .min(1)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length);
export const mappoolBatchRow = z
  .object({
    category: z.enum(categories),
    position,
    beatmap: z.string().trim().min(1).max(250),
    expectedMetadataFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const mappoolRequest = z.discriminatedUnion("action", [
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("history_import"),
      sourceEdition: z.string().min(1).max(80),
      sourcePool: z.string().min(1).max(80),
      sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      sourceKeys: z
        .array(z.string().min(1).max(80))
        .min(1)
        .max(50)
        .refine((keys) => new Set(keys).size === keys.length),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("batch_import"),
      text: z.string().max(16000),
      category: z.enum(categories),
      rows: z.array(mappoolBatchRow).min(1).max(50),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("batch_remove"),
      entryIds: batchIds,
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("batch_move"),
      entryIds: batchIds,
      category: z.enum(categories),
      position,
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("batch_refresh"),
      entryIds: batchIds,
    })
    .strict(),

  z
    .object({
      ...confirmation,
      action: z.literal("round_create"),
      stage: z.enum(["group", "knockout", "exhibition"]),
      name,
      position,
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("round_edit"),
      roundId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      name,
      position,
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("round_delete"),
      roundId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("pool_create"),
      roundId: z.uuid(),
      name,
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("pool_settings"),
      name,
      fmMode: z.enum(["free_mod", "force_mod"]).nullable(),
      fmRestrictions: z.string().trim().max(2000),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("pool_publish"),
      published: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("entry_save"),
      downloadMirror: downloadMirrorSchema.nullable().optional(),
      difficultyConfiguration: z
        .enum(difficultyConfigurations)
        .nullable()
        .default(null),
      expectedMetadataFingerprint: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      entryId: z.uuid().nullable(),
      beatmap: z.string().trim().min(1).max(250),
      category: z.enum(categories),
      position,
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("entry_remove"),
      entryId: z.uuid(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("entry_refresh"),
      entryId: z.uuid(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      ...versioned,
      action: z.literal("reorder"),
      category: z.enum(categories),
      entryIds: z.array(z.uuid()).min(1).max(999),
    })
    .strict(),
]);

const roundIdsSchema = z
  .array(z.uuid())
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length);
export const selectionCommandInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("skillsets"),
      candidateId: z.uuid(),
      tags: z
        .array(z.enum(skillsetTags))
        .max(skillsetTags.length)
        .refine((tags) => new Set(tags).size === tags.length),
      expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  z
    .object({
      action: z.literal("assign_rounds"),
      candidateId: z.uuid(),
      roundIds: roundIdsSchema,
      expectedRoundIds: roundIdsSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("comment_edit"),
      candidateId: z.uuid(),
      commentId: z.uuid(),
      version: z.string().regex(/^\d+$/),
      body: z.string().trim().min(1).max(commentLength),
    })
    .strict(),
  z
    .object({
      action: z.literal("comment_delete"),
      candidateId: z.uuid(),
      commentId: z.uuid(),
      version: z.string().regex(/^\d+$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("classify"),
      candidateId: z.uuid(),
      category: z.enum(candidateCategories),
      expectedCategory: z.enum(candidateCategories),
    })
    .strict(),
  z
    .object({
      action: z.literal("add"),
      category: z.enum(candidateCategories).default("unassigned"),
      roundIds: roundIdsSchema.default([]),
      rows: z
        .array(
          z
            .object({
              beatmapId: z
                .number()
                .int()
                .positive()
                .max(Number.MAX_SAFE_INTEGER),
              fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            })
            .strict(),
        )
        .min(1)
        .max(50)
        .refine(
          (rows) => new Set(rows.map((r) => r.beatmapId)).size === rows.length,
        ),
    })
    .strict(),
  z
    .object({
      action: z.literal("comment"),
      candidateId: z.uuid(),
      requestId: z.uuid(),
      body: z.string().trim().min(1).max(commentLength),
    })
    .strict(),
]);

export const singleBeatmapPreviewInput = z.strictObject({
  beatmap: z.string().trim().min(1).max(250),
  difficultyConfiguration: z
    .enum(difficultyConfigurations)
    .nullable()
    .default(null),
});

export const batchBeatmapPreviewInput = z.strictObject({
  ...versioned,
  text: z.string().max(16000),
  category: z.enum(categories).default("NM"),
});

export const candidatePreviewInput = z.strictObject({
  text: z.string().max(16000),
  category: z.enum(candidateCategories).default("unassigned"),
});

const number = z.number();
const text = z.string();
const ruleset = z.enum(["osu", "taiko", "fruits", "mania"]);
const configuration = z.enum(difficultyConfigurations);
const difficultyStats = {
  ar: number.nullable(),
  od: number.nullable(),
  cs: number.nullable(),
  hp: number.nullable(),
};
const attributes = z.object({
  configuration,
  mods: z.array(text),
  ruleset,
  stars: number,
  maxCombo: number.nullable(),
  values: z.record(text, number),
  fetchedAt: text,
});
const beatmapMetadata = z.object({
  setId: number,
  title: text,
  artist: text,
  difficulty: text,
  mapper: text,
  stars: number,
  bpm: number,
  duration: number,
  status: text.optional(),
  checksum: text.nullable().optional(),
  mode: ruleset.optional(),
  ar: difficultyStats.ar.optional(),
  od: difficultyStats.od.optional(),
  cs: difficultyStats.cs.optional(),
  hp: difficultyStats.hp.optional(),
  attributes: attributes.optional(),
  difficultySnapshot: z
    .object({
      beatmapId: number,
      ruleset,
      checksum: text.nullable(),
      fetchedAt: text,
      base: z.object({
        ...difficultyStats,
        stars: number.nullable(),
        bpm: number.nullable(),
        duration: number.nullable(),
      }),
      variants: z.partialRecord(configuration, attributes),
    })
    .optional(),
}) satisfies z.ZodType<BeatmapMetadata>;

export const beatmapPreviewResponse = z.object({
  beatmapId: number,
  metadata: beatmapMetadata,
  fetchedAt: text,
  fingerprint: text,
});

const rowResult = {
  line: number,
  beatmapId: number.nullable(),
  error: text.nullable(),
  snapshot: beatmapPreviewResponse.nullable(),
};
export const mappoolBatchPreviewResponse = z.object({
  poolId: z.uuid(),
  version: number,
  rows: z.array(
    z.object({
      ...rowResult,
      category: z.enum(categories).nullable(),
      position: number.nullable(),
      warning: text.nullable(),
    }),
  ),
});

export const candidatePreviewResponse = z.object({
  rows: z.array(
    z.object({
      ...rowResult,
      input: text,
      status: z.enum(["ready", "duplicate", "invalid", "failed"]),
    }),
  ),
});

export const selectionReceipt = z.object({
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export type MappoolBatchPreview = z.output<typeof mappoolBatchPreviewResponse>;
export type CandidatePreview = z.output<typeof candidatePreviewResponse>;
export type SelectionReceipt = z.output<typeof selectionReceipt>;

const browserPost = {
  method: "POST",
  access: "browser",
  successStatus: 200,
} as const;
const editionPath = "/api/admin/tournaments/{edition}";
const commonErrors = {
  401: "An active browser session is required.",
  403: "Origin, authentication channel, or edition capability rejected.",
  404: "The edition or requested resource was not found.",
  500: "Unexpected failure.",
  503: "Site or osu! provider configuration is unavailable.",
};
const lookupErrors = {
  ...commonErrors,
  429: "The lookup budget or refresh rate limit was reached.",
  502: "osu! returned unavailable or incomplete metadata.",
  504: "The osu! lookup timed out.",
};

export const changeMappoolWrite = {
  ...browserPost,
  id: "changeMappool",
  path: `${editionPath}/mappools`,
  maxBodyBytes: defaultJsonBodyLimit,
  request: mappoolRequest,
  summary: "Manage rounds and official mappools",
  description:
    "Requires manage_mappools and explicit confirmation. Existing pool and round edits check their current version. Batch and historical imports also check the resolved slots and source fingerprints. Publication and map edits enforce the current pool and fixture locks.",
  successDescription: "The current staff mappool workspace.",
  response: { readResource: "mappoolWorkspace" },
  errors: {
    ...lookupErrors,
    400: "Invalid command, source, slot, or round configuration.",
    409: "A stale version, changed metadata, conflicting slot, or pool lock prevents the change.",
  },
  consumers: [
    "src/components/exhibition-pool-import.tsx",
    "src/components/mappool-batch.tsx",
    "src/components/mappool-editor.tsx",
    "src/components/mappool-workbench.tsx",
    "src/components/round-manager.tsx",
  ],
} as const satisfies WriteApiOperation;

export const previewMappoolWrite = {
  ...browserPost,
  id: "previewMappool",
  path: `${editionPath}/mappools/preview`,
  maxBodyBytes: 20000,
  request: z.union([singleBeatmapPreviewInput, batchBeatmapPreviewInput]),
  summary: "Preview an official beatmap or a batch of pool slots",
  description:
    "Requires manage_mappools. A beatmap ID or canonical difficulty URL returns its verified snapshot. A body with text selects the batch branch and requires an editable pool and its current version. The batch reports per-row errors and warnings. Previewing makes no pool or audit changes.",
  successDescription: "A single beatmap snapshot or the batch preview.",
  response: z.union([beatmapPreviewResponse, mappoolBatchPreviewResponse]),
  errors: {
    ...lookupErrors,
    400: "Invalid beatmap input or batch rows.",
    409: "The pool version is stale or the pool is locked.",
  },
  consumers: [
    "src/components/mappool-batch.tsx",
    "src/components/mappool-editor.tsx",
  ],
} as const satisfies WriteApiOperation;

export const changeMappoolWorkbenchWrite = {
  ...browserPost,
  id: "changeMappoolWorkbench",
  path: `${editionPath}/mappool-workbench`,
  maxBodyBytes: defaultJsonBodyLimit,
  request: z.union([
    candidatePreviewInput.extend({ action: z.literal("preview") }).loose(),
    selectionCommandInput,
  ]),
  summary: "Preview and manage private selection candidates",
  description:
    "Requires select_mappools. Preview consumes provider budget without changing candidates. Candidate changes validate the submitted fingerprints or expected category, rounds or version as applicable. Comment edits and deletion require authorship. Replaying an identical comment request ID returns a skipped count without adding another comment.",
  successDescription:
    "Per-row preview results or counts for a completed change.",
  response: z.union([candidatePreviewResponse, selectionReceipt]),
  errors: {
    ...lookupErrors,
    400: "Invalid preview, command, or cross-edition round reference.",
    409: "A stale value, changed preview, archive lock, duplicate, capacity limit, or conflicting request ID prevents the change.",
  },
  consumers: ["src/components/mappool-workbench.tsx"],
} as const satisfies WriteApiOperation;
