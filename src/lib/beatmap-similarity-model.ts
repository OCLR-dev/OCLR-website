import { z } from "zod";
import { effectiveDifficulty } from "./difficulty-display";
import { difficultySnapshotSchema } from "./difficulty-snapshot";
import { difficultyConfigurations, slotLabel } from "./mappool-model";

export const publicOrigin = "https://oclr.org";
export const modSchema = z.enum(difficultyConfigurations);
export const editionSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
export const bidSchema = z.number().int().positive();
const checksumSchema = z.string().regex(/^[0-9a-f]{32}$/i);
const categorySchema = z.enum(["NM", "HD", "HR", "DT", "FM", "TB", "ACE"]);

export const features = {
  stars: { unit: "★", weight: 0.5 },
  bpm: { unit: "BPM", weight: 1 },
  duration: { unit: "s", weight: 0.75 },
  ar: { unit: "AR", weight: 1 },
  od: { unit: "OD", weight: 1 },
  cs: { unit: "CS", weight: 1 },
  hp: { unit: "HP", weight: 0.5 },
  aim: { unit: "difficulty", weight: 1.5 },
  speed: { unit: "difficulty", weight: 1.5 },
  reading: { unit: "difficulty", weight: 1 },
  rhythmChangeShare: { unit: "fraction", weight: 1 },
  sustainedDensity: { unit: "objects/s", weight: 1 },
} as const;
export type Feature = keyof typeof features;
export const featureNames = Object.keys(features) as Feature[];
export const baseFeatures = [
  "stars",
  "bpm",
  "duration",
  "ar",
  "od",
  "cs",
  "hp",
] as const;
const featureValues = z.partialRecord(
  z.enum(featureNames),
  z.number().finite().nonnegative(),
);

const slotSchema = z.object({
  edition: editionSchema,
  poolId: z.string().min(1),
  poolName: z.string().min(1),
  slot: z.string(),
  category: categorySchema,
  bid: bidSchema.nullable(),
  setId: bidSchema.optional(),
  title: z.string().nullable(),
  mod: modSchema.nullable(),
  checksum: checksumSchema.optional(),
  difficultyFetchedAt: z.iso.datetime({ offset: true }).optional(),
  values: featureValues,
  excluded: z
    .enum([
      "missing-bid",
      "unresolved-slot-mod",
      "missing-snapshot",
      "not-osu-standard",
      "unverified-version",
      "missing-mod-attributes",
    ])
    .optional(),
  file: z.enum(["missing", "unverified", "verified"]).optional(),
});
export type Slot = z.infer<typeof slotSchema>;
const editionSource = z.object({
  edition: editionSchema,
  revision: z.number().int().nonnegative(),
  kind: z.enum(["archive", "native"]),
});
export const snapshotSchema = z
  .object({
    version: z.literal(1),
    capturedAt: z.iso.datetime({ offset: true }),
    sources: z.array(editionSource).min(2),
    slots: z.array(slotSchema),
  })
  .superRefine((snapshot, context) => {
    const editions = new Set(snapshot.sources.map((source) => source.edition));
    if (
      editions.size !== snapshot.sources.length ||
      snapshot.slots.some((slot) => !editions.has(slot.edition))
    ) {
      context.addIssue({
        code: "custom",
        message: "Snapshot source editions do not match its pool slots.",
      });
    }
  });
export type Snapshot = z.infer<typeof snapshotSchema>;

export const configurationEnvelope = z.object({
  data: z.object({
    revision: z.number().int().nonnegative(),
    edition: z.object({
      slug: editionSchema,
      published: z.literal(true),
      archive: z
        .object({
          pools: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              maps: z.array(
                z.object({
                  slot: z.string().regex(/^(NM|HD|HR|DT|FM|TB|ACE)[1-9]\d*$/),
                  beatmapId: bidSchema.nullable(),
                  beatmapSetId: bidSchema.optional(),
                  title: z.string().nullable(),
                  difficultySnapshot: z.unknown().optional(),
                }),
              ),
            }),
          ),
        })
        .nullish(),
    }),
  }),
});

const nativeEnvelope = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      roundName: z.string(),
      publishedAt: z.iso.datetime({ offset: true }).nullable(),
      entries: z.array(
        z.object({
          category: categorySchema,
          position: z.number().int().positive(),
          beatmapId: bidSchema,
          metadata: z.object({
            setId: z.number().int().nonnegative(),
            title: z.string(),
            artist: z.string(),
            difficulty: z.string(),
            checksum: checksumSchema.nullish(),
            mode: z.string().optional(),
            attributes: z.object({ configuration: modSchema }).optional(),
            difficultySnapshot: z.unknown().optional(),
          }),
        }),
      ),
    }),
  ),
});

export function sourceUrls(source: Snapshot["sources"][number]) {
  const tournament = publicOrigin + "/tournaments/" + source.edition;
  const resource = publicOrigin + "/api/v1/tournaments/" + source.edition;
  return {
    page: tournament + "/mappools",
    configuration: resource + "/configuration",
    ...(source.kind === "native" ? { mappools: resource + "/mappools" } : {}),
  };
}

export function poolUrl(slot: Pick<Slot, "edition" | "poolId">) {
  return (
    publicOrigin +
    "/tournaments/" +
    slot.edition +
    "/mappools/" +
    encodeURIComponent(slot.poolId)
  );
}

function fixedMod(
  category: Slot["category"],
  explicit?: Slot["mod"],
): Slot["mod"] {
  if (category === "NM") return "NM";
  if (category === "HD" || category === "HR" || category === "DT")
    return explicit ?? category;
  return null;
}

function projectSlot(
  origin: Omit<
    Slot,
    "values" | "excluded" | "checksum" | "difficultyFetchedAt"
  >,
  raw: unknown,
  expected?: { checksum?: string | null; mode?: string },
): Slot {
  const slot: Slot = { ...origin, values: {} };
  if (!slot.bid) return { ...slot, excluded: "missing-bid" };
  if (!slot.mod) return { ...slot, excluded: "unresolved-slot-mod" };
  const parsed = difficultySnapshotSchema.safeParse(raw);
  if (!parsed.success || parsed.data.beatmapId !== slot.bid)
    return { ...slot, excluded: "missing-snapshot" };
  const snapshot = parsed.data;
  if (snapshot.ruleset !== "osu" || (expected?.mode && expected.mode !== "osu"))
    return { ...slot, excluded: "not-osu-standard" };
  if (
    !snapshot.checksum ||
    (expected?.checksum &&
      expected.checksum.toLowerCase() !== snapshot.checksum.toLowerCase())
  )
    return { ...slot, excluded: "unverified-version" };
  const attributes = snapshot.variants[slot.mod];
  if (slot.mod !== "NM" && !attributes)
    return { ...slot, excluded: "missing-mod-attributes" };
  const values =
    slot.mod !== "NM" && attributes
      ? effectiveDifficulty(snapshot.base, attributes)
      : snapshot.base;
  for (const feature of baseFeatures) {
    const value = values[feature];
    if (
      value !== null &&
      ((feature !== "bpm" && feature !== "duration") || value > 0)
    )
      slot.values[feature] = value;
  }
  for (const feature of ["aim", "speed", "reading"] as const) {
    const value = attributes?.values[feature + "_difficulty"];
    if (value !== undefined && value >= 0) slot.values[feature] = value;
  }
  return {
    ...slot,
    checksum: snapshot.checksum.toLowerCase(),
    difficultyFetchedAt: attributes?.fetchedAt ?? snapshot.fetchedAt,
  };
}

export function projectPublicPools(
  edition: string,
  configuration: unknown,
  mappools?: unknown,
) {
  const { data } = configurationEnvelope.parse(configuration);
  if (data.edition.slug !== edition)
    throw new Error("Published edition slug does not match " + edition);
  const archive = data.edition.archive;
  const source = editionSource.parse({
    edition,
    revision: data.revision,
    kind: archive ? "archive" : "native",
  });
  const slots = archive
    ? archive.pools.flatMap((pool) =>
        pool.maps.map((map) => {
          const category = categorySchema.parse(map.slot.replace(/\d+$/, ""));
          return projectSlot(
            {
              edition,
              poolId: pool.id,
              poolName: pool.name,
              slot: map.slot,
              category,
              bid: map.beatmapId,
              setId: map.beatmapSetId,
              title: map.title,
              mod: fixedMod(category),
            },
            map.difficultySnapshot,
          );
        }),
      )
    : nativeEnvelope
        .parse(mappools)
        .data.filter((pool) => pool.publishedAt !== null)
        .flatMap((pool) =>
          pool.entries.map((entry) =>
            projectSlot(
              {
                edition,
                poolId: pool.id,
                poolName: pool.roundName + " · " + pool.name,
                slot: slotLabel(entry.category, entry.position),
                category: entry.category,
                bid: entry.beatmapId,
                setId: entry.metadata.setId || undefined,
                title:
                  entry.metadata.artist +
                  " - " +
                  entry.metadata.title +
                  " [" +
                  entry.metadata.difficulty +
                  "]",
                mod: fixedMod(
                  entry.category,
                  entry.metadata.attributes?.configuration,
                ),
              },
              entry.metadata.difficultySnapshot,
              entry.metadata,
            ),
          ),
        );
  return { source, slots };
}
