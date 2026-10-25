import { db } from "@/db";
import { mappools, tournamentRounds } from "@/db/schema";
import { english, type AppTranslator } from "@/i18n/translate";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { cache } from "react";
import { getAnnouncements } from "./announcements";
import { privacyReady } from "./auth/config";
import { remoteMode } from "./data-source";
import { formatDate } from "./editions";
import { frontendResource } from "./frontend-resource";
import { publicCompetition } from "./public-competition";
import { projectPublicNews, type OfficialNewsEvent } from "./public-news-model";
import { readTournaments } from "./tournaments";
async function loadNews(now: Date, tr: AppTranslator) {
  const editions = await readTournaments(true);
  const events: OfficialNewsEvent[] = [];
  if (editions.length) {
    const pools = await db()
      .select({
        id: mappools.id,
        slug: mappools.editionSlug,
        name: mappools.name,
        at: mappools.publishedAt,
        round: tournamentRounds.name,
      })
      .from(mappools)
      .innerJoin(tournamentRounds, eq(tournamentRounds.id, mappools.roundId))
      .where(
        and(
          isNotNull(mappools.publishedAt),
          inArray(
            mappools.editionSlug,
            editions.map((r) => r.edition.slug),
          ),
        ),
      );
    events.push(
      ...pools.map((p) => ({
        editionSlug: p.slug,
        kind: "mappool" as const,
        id: p.id,
        title: tr("Mappool released: {name}", { name: p.name }),
        summary: tr(
          "{name} for {round} is published. View the released beatmaps and slot configuration.",
          { name: p.name, round: p.round },
        ),
        at: p.at!.toISOString(),
        url: `/tournaments/${p.slug}/mappools/${p.id}`,
      })),
    );
    // Reuse the existing privacy/progression projection; never publish imported or unapproved scores.
    const competitions: {
      slug: string;
      data: Awaited<ReturnType<typeof publicCompetition>>;
    }[] = [];
    for (const { edition } of editions)
      competitions.push({
        slug: edition.slug,
        data: await publicCompetition(edition.slug),
      });
    for (const { slug, data } of competitions)
      for (const f of data?.fixtures ?? []) {
        events.push({
          editionSlug: slug,
          kind: "fixture",
          id: f.id,
          title: tr("Fixture published: {label}", { label: f.label }),
          summary: tr(
            "{round}: {home} vs {away}. {time} A published fixture does not establish a completed result.",
            {
              round: f.roundName,
              home: f.home.label,
              away: f.away.label,
              time: f.scheduledAt
                ? tr("Scheduled for {time}.", {
                    time: formatDate(f.scheduledAt, f.timeZone, tr.locale),
                  })
                : tr("Match time is to be announced."),
            },
          ),
          at: f.publishedAt,
          url: `/tournaments/${slug}/matches/${f.id}`,
        });
        if (f.result)
          events.push({
            editionSlug: slug,
            kind: "result",
            id: f.id,
            title: tr("Result published: {label}", { label: f.label }),
            summary: tr(
              "{round}: {home} {homeWins}–{awayWins} {away}. View the approved match result and latest published updates.",
              {
                round: f.roundName,
                home: f.home.label,
                homeWins: f.result.homeWins,
                awayWins: f.result.awayWins,
                away: f.away.label,
              },
            ),
            at: f.result.updatedAt,
            url: `/tournaments/${slug}/matches/${f.id}`,
          });
      }
  }
  return {
    editions: editions.map((r) => r.edition),
    items: projectPublicNews(
      editions,
      events,
      getAnnouncements(),
      privacyReady(),
      now,
      tr,
    ),
  };
}
// Request-scoped memoization only: fresh requests reflect time windows, retractions and corrections.
const requestNews = cache((tr: AppTranslator) => loadNews(new Date(), tr));
export function publicNewsContext(now?: Date, tr: AppTranslator = english) {
  if (remoteMode())
    return frontendResource<Awaited<ReturnType<typeof loadNews>>>(
      "publicNewsModel",
      { locale: tr.locale.startsWith("en") ? "en" : tr.locale },
    );
  return now ? loadNews(now, tr) : requestNews(tr);
}
export async function publicNews(now?: Date, tr: AppTranslator = english) {
  return (await publicNewsContext(now, tr)).items;
}
export async function publicNewsItem(
  slug: string,
  now?: Date,
  tr: AppTranslator = english,
) {
  return (await publicNews(now, tr)).find((item) => item.slug === slug);
}
