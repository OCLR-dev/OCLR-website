import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { chatArtworkCaptions as captions } from "@/db/schema";
import { archiveArtworkLookup } from "./archive-artwork";
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

type ArtworkMap = { image: string; title: string; url: string };

export async function publicArtwork(edition: Edition) {
  const maps: ArtworkMap[] = [];
  let unresolvedSlots = 0;
  let lookupIncomplete = false;
  if (edition.archive) {
    const pools = edition.archive.pools.map((pool) =>
      archivePoolMetadata(pool, edition.slug),
    );
    const unresolvedIds = pools.flatMap((display) =>
      display.pool.maps.flatMap((map) => {
        if (map.coverPath || map.backgroundSetId || map.beatmapSetId) return [];
        return [map.beatmapId, map.originalId ?? null].filter(
          (id) =>
            id !== null &&
            !display.setIds[id] &&
            !display.missingBeatmapIds.includes(id),
        );
      }),
    );
    const lookup = await archiveArtworkLookup(unresolvedIds);
    const missing = new Set(lookup.missingBeatmapIds);
    lookupIncomplete = unresolvedIds.some(
      (id) => id !== null && !lookup.setIds[id] && !missing.has(id),
    );
    for (const display of pools) {
      const { pool } = display;
      for (const map of pool.maps) {
        const setId = (id: number | null | undefined) =>
          id ? (display.setIds[id] ?? lookup.setIds[id]) : null;
        const original = setId(map.originalId);
        const set =
          map.beatmapSetId ??
          (map.preferOriginal ? original : setId(map.beatmapId));
        const imageSet = map.backgroundSetId ?? set ?? original;
        const image = map.coverPath ?? (imageSet ? String(imageSet) : null);
        if (!image) {
          unresolvedSlots++;
          continue;
        }
        const preferOriginal =
          map.preferOriginal ||
          (map.beatmapId &&
            (missing.has(map.beatmapId) ||
              display.missingBeatmapIds.includes(map.beatmapId)));
        const link = beatmapLinks(
          preferOriginal
            ? (map.originalId ?? map.beatmapId)
            : (map.beatmapId ?? map.originalId),
          set ?? original,
        ).web;
        maps.push({
          image,
          title: [pool.name, map.slot, map.title].filter(Boolean).join(" · "),
          url:
            link ??
            `/tournaments/${edition.slug}/mappools/${encodeURIComponent(pool.id)}#map-${map.slot}`,
        });
      }
    }
  } else {
    for (const pool of await publicMappools(edition.slug)) {
      for (const entry of pool.entries) {
        const set = entry.metadata.setId;
        const url = beatmapLinks(entry.beatmapId, set).web;
        if (!set || !url) {
          unresolvedSlots++;
          continue;
        }
        maps.push({
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
        });
      }
    }
  }
  return { maps, unresolvedSlots, lookupIncomplete };
}

export function describedArtwork(
  maps: ArtworkMap[],
  descriptions: ReadonlyMap<string, string | null>,
) {
  return maps.flatMap(({ image, title, url }) => {
    const text = descriptions.get(image);
    return text ? [{ title, url, text }] : [];
  });
}

export async function artworkSources(edition: Edition) {
  const vision = visionConfiguration();
  if (!vision) return [];
  const { maps } = await publicArtwork(edition);
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
  return describedArtwork(
    maps,
    new Map(saved.map((row) => [row.image, row.caption])),
  );
}
