import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { chatArtworkCaptions as captions } from "@/db/schema";
import { archivePoolMetadata } from "./archive-map-metadata";
import { beatmapLinks } from "./beatmap-links";
import { chatConfiguration } from "./chat-config";
import type { Edition } from "./editions";
import { publicMappools } from "./mappool-reads";
import { slotLabel } from "./mappool-model";

export function visionConfiguration() {
  const config = chatConfiguration();
  const model = process.env.OCLR_CHAT_VISION_MODEL?.trim();
  if (!model || !config) return null;
  const key = createHash("sha256")
    .update(JSON.stringify([1, config.baseURL, model]))
    .digest("hex");
  return { config, model, key };
}

export function artworkQuery(
  question: string,
  mappoolContext = false,
): string | null {
  const query = question
    .normalize("NFKC")
    .replace(
      /https?:\/\/[^\s>)]+|\/tournaments\/[a-z0-9-]+\/mappools[^\s>)]*/gi,
      " ",
    );
  if (
    !/(?:背景(?:[圖图]|畫面|画面)?|封面|\bbg\b|bg[圖图]|backgrounds?|covers?|artwork)/i.test(
      query,
    ) ||
    (!mappoolContext &&
      !/(?:[譜谱]面|[圖图]池|\b(?:beat)?maps?\b|mappools?|bg[圖图]|[哪那][張张首][圖图])/i.test(
        query,
      ))
  )
    return null;
  return query
    .replace(
      /(?:[譜谱]面|[圖图]池|背景[圖图]?|封面|bg[圖图]?|mappools?|(?:beat)?maps?|backgrounds?|covers?|artwork|哪些|哪[些個个張张首]|[圖图]片|請問|请问|的|是|包含|[？?／/])/gi,
      " ",
    )
    .replace(
      /\b(?:which|what|have|has|with|show|shows|a|an|the|in|on|their|are|is)\b/gi,
      " ",
    )
    .trim();
}

export async function publicArtwork(edition: Edition) {
  if (edition.archive)
    return edition.archive.pools.flatMap((pool) => {
      const display = archivePoolMetadata(pool, edition.slug);
      return display.pool.maps.flatMap((map) => {
        const set =
          map.beatmapSetId ?? (map.beatmapId && display.setIds[map.beatmapId]);
        const original = map.originalId && display.setIds[map.originalId];
        const imageSet = map.backgroundSetId ?? set ?? original;
        const image = map.coverPath ?? (imageSet ? String(imageSet) : null);
        if (!image) return [];
        const preferOriginal =
          map.preferOriginal ||
          (map.beatmapId && display.missingBeatmapIds.includes(map.beatmapId));
        const link = beatmapLinks(
          preferOriginal
            ? (map.originalId ?? map.beatmapId)
            : (map.beatmapId ?? map.originalId),
          set ?? original,
        ).web;
        return [
          {
            image,
            title: [pool.name, map.slot, map.title].filter(Boolean).join(" · "),
            url:
              link ??
              `/tournaments/${edition.slug}/mappools/${encodeURIComponent(pool.id)}#map-${map.slot}`,
          },
        ];
      });
    });
  return (await publicMappools(edition.slug)).flatMap((pool) =>
    pool.entries.flatMap((entry) => {
      const set = entry.metadata.setId;
      const url = beatmapLinks(entry.beatmapId, set).web;
      if (!set || !url) return [];
      return [
        {
          image: String(set),
          title: [
            pool.name,
            slotLabel(entry.category, entry.position),
            entry.metadata.artist,
            entry.metadata.title,
            entry.metadata.difficulty,
          ]
            .filter(Boolean)
            .join(" · "),
          url,
        },
      ];
    }),
  );
}

export async function artworkSources(edition: Edition) {
  const vision = visionConfiguration();
  if (!vision) return [];
  const maps = await publicArtwork(edition);
  if (!maps.length) return [];
  const saved = await db()
    .select({ image: captions.image, caption: captions.caption })
    .from(captions)
    .where(
      and(
        eq(captions.model, vision.key),
        inArray(captions.image, [...new Set(maps.map((m) => m.image))]),
        isNotNull(captions.caption),
      ),
    );
  const descriptions = new Map(saved.map((row) => [row.image, row.caption]));
  return maps.flatMap(({ image, title, url }) => {
    const text = descriptions.get(image);
    return text ? [{ title, url, text }] : [];
  });
}
