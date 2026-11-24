import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatRuleIndexes } from "@/db/schema";
import { getPublicEdition } from "./content";
import { HttpError } from "./http-error";
import { publicCompetition } from "./public-competition";
import { slotLabel } from "./mappool-model";
import { publicMappools } from "./mappool-reads";
import { recordedArchiveMatch } from "./historical-archive";
import {
  rankedSources,
  publishedRuleChapters,
  ruleExcerpts,
  type ChatSource,
} from "./chat-retrieval";
import type { Edition } from "./editions";

async function indexedRules(edition: Edition) {
  const chapters = publishedRuleChapters(edition);
  const fingerprint = createHash("sha256")
    .update("excerpts-v1\n")
    .update(JSON.stringify(chapters))
    .digest("hex");
  const [hit] = await db()
    .select({ sections: chatRuleIndexes.sections })
    .from(chatRuleIndexes)
    .where(
      and(
        eq(chatRuleIndexes.editionSlug, edition.slug),
        eq(chatRuleIndexes.fingerprint, fingerprint),
      ),
    );
  if (hit) return hit.sections;
  const sources = ruleExcerpts(chapters);
  await db()
    .insert(chatRuleIndexes)
    .values({ editionSlug: edition.slug, fingerprint, sections: sources })
    .onConflictDoUpdate({
      target: chatRuleIndexes.editionSlug,
      set: { fingerprint, sections: sources },
    });
  return sources;
}

type Match = {
  id: string;
  label: string;
  teams: string;
  time: string | null;
  score: string | null;
  cancelled?: boolean;
};
async function matches(edition: Edition): Promise<Match[]> {
  const archive = edition.archive;
  if (archive) {
    const teams = new Map(archive.teams.map((t) => [t.id, t.name]));
    return archive.matches.map((m) => ({
      id: m.id,
      label: m.stage + " " + m.label,
      teams: [teams.get(m.teamA), teams.get(m.teamB)].join(" / "),
      time: m.scheduledAt,
      score: recordedArchiveMatch(m) ? (m.score?.join("–") ?? "forfeit") : null,
    }));
  }
  const competition = await publicCompetition(edition.slug);
  if (!competition) throw new HttpError(404, "Tournament not found.");
  return competition.fixtures.map((f) => ({
    id: f.id,
    label: f.roundName + " " + f.label,
    teams: f.home.label + " / " + f.away.label,
    time: f.scheduledAt,
    score: f.result ? [f.result.homeWins, f.result.awayWins].join("–") : null,
    cancelled: f.status === "cancelled",
  }));
}

async function poolSources(edition: Edition): Promise<ChatSource[]> {
  const pools = edition.archive
    ? edition.archive.pools.map((p) => ({
        id: p.id,
        name: p.name,
        maps: p.maps.map((m) =>
          [m.slot, m.title, m.beatmapId].filter(Boolean).join(" "),
        ),
      }))
    : (await publicMappools(edition.slug)).map((p) => ({
        id: p.id,
        name: p.roundName + " " + p.name,
        maps: p.entries.map((e) =>
          [
            slotLabel(e.category, e.position),
            e.metadata.title,
            e.beatmapId,
          ].join(" "),
        ),
      }));
  return pools.flatMap((p) =>
    p.maps.map((text) => ({
      url: `/tournaments/${edition.slug}/mappools/${encodeURIComponent(p.id)}`,
      title: p.name,
      text,
    })),
  );
}

export async function chatEvidence(
  slug: string,
  question: string,
  previous: string,
  now = Date.now(),
) {
  const edition = await getPublicEdition(slug);
  if (!edition) throw new HttpError(404, "Tournament not found.");
  const base = "/tournaments/" + slug;
  const matchIntent =
    /賽程|赛程|比[分賽赛]|賽果|赛果|下一[場场]|幾點|几点|對陣|对阵|schedule|match|score|result|fixture|when|who won/i;
  const poolIntent =
    /[圖图]池|曲池|mappool|map pool|beatmap|\b(?:nm|hd|hr|dt|fm|tb)\d*\b/i;
  const questionWithContext = question + " " + previous;
  const intentText =
    matchIntent.test(question) || poolIntent.test(question)
      ? question
      : questionWithContext;
  const rules = await indexedRules(edition);
  const sources = rankedSources(rules, question, 3);
  if (!sources.length && previous)
    sources.push(...rankedSources(rules, questionWithContext, 2));
  if (matchIntent.test(intentText)) {
    let fixtures = await matches(edition);
    const next = /下一[場场]|\bnext\b/i.test(intentText);
    if (next)
      fixtures = fixtures
        .filter(
          (f) =>
            f.time && Date.parse(f.time) >= now && !f.score && !f.cancelled,
        )
        .sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
    else
      fixtures.sort(
        (a, b) =>
          (Date.parse(b.time ?? "") || 0) - (Date.parse(a.time ?? "") || 0),
      );
    const candidates = fixtures.map((f) => ({
      title: [f.label, f.teams].join(" · "),
      url: `${base}/matches/${encodeURIComponent(f.id)}`,
      text: JSON.stringify({
        scheduledAt: f.time,
        timeZone: edition.timeZone,
        publishedScore: f.score,
        cancelled: f.cancelled ?? false,
      }),
    }));
    sources.push(
      ...(candidates.length
        ? rankedSources(candidates, questionWithContext, next ? 1 : 4, true)
        : [
            {
              title: edition.name,
              url: base + "/schedule",
              text: next
                ? "No upcoming published match."
                : "No published fixtures.",
            },
          ]),
    );
  }
  if (poolIntent.test(intentText)) {
    const maps = await poolSources(edition);
    sources.push(
      ...(maps.length
        ? rankedSources(maps, questionWithContext, 16, true)
        : [
            {
              title: edition.name,
              url: base + "/mappools",
              text: "No published mappools.",
            },
          ]),
    );
  }
  return { edition: edition.name, sources };
}
