import { english, type AppTranslator } from "@/i18n/translate";
import { createHash } from "node:crypto";
import { enrollmentState, formatDate, type Edition } from "./editions";
import type { announcementsSchema } from "./announcements";
import type { z } from "zod";
export type PublicNewsItem = {
  slug: string;
  title: string;
  summary: string;
  at: string;
  timeZone: string;
  kind:
    | "announcement"
    | "schedule"
    | "registration"
    | "mappool"
    | "fixture"
    | "result";
  future: boolean;
  source: { label: string; url: string } | null;
  sections: { heading: string; body: string }[];
};
/** Display labels are interface copy; never expose internal event identifiers. */
export function publicNewsKind(
  item: Pick<PublicNewsItem, "kind" | "future">,
  tr: AppTranslator = english,
) {
  if (item.future) return tr("Scheduled");
  const labels: Record<PublicNewsItem["kind"], string> = {
    announcement: tr("Announcement"),
    schedule: tr("Schedule"),
    registration: tr("Registration"),
    mappool: tr("Mappool"),
    fixture: tr("Fixture"),
    result: tr("Result"),
  };
  return labels[item.kind];
}
export type NewsEdition = { edition: Edition; registrationPaused: boolean };
export type OfficialNewsEvent = {
  editionSlug: string;
  kind: "mappool" | "fixture" | "result";
  id: string;
  title: string;
  summary: string;
  at: string;
  url: string;
};
function eventSlug(edition: string, kind: string, id: string) {
  return `event-${createHash("sha256")
    .update(JSON.stringify([edition, kind, id]))
    .digest("hex")
    .slice(0, 32)}`;
}
/** Read-only projection: clock changes never certify that a scheduled competition event occurred. */
export function projectPublicNews(
  editions: NewsEdition[],
  events: OfficialNewsEvent[],
  manual: z.infer<typeof announcementsSchema>,
  privacyConfigured: boolean,
  now = new Date(),
  tr: AppTranslator = english,
): PublicNewsItem[] {
  const items: PublicNewsItem[] = manual
    .filter(
      (a) =>
        a.published &&
        a.publishedAt &&
        Date.parse(a.publishedAt) <= now.getTime(),
    )
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      sections: a.sections,
      at: a.publishedAt!,
      timeZone: "UTC",
      kind: "announcement",
      future: false,
      source: null,
    }));
  for (const { edition: e, registrationPaused } of editions.filter(
    (r) => r.edition.published,
  )) {
    function add(
      kind: PublicNewsItem["kind"],
      id: string,
      title: string,
      summary: string,
      at: string,
      path: string,
    ) {
      items.push({
        slug: eventSlug(e.slug, kind, id),
        title: `${title} — ${e.name}`,
        summary,
        at,
        timeZone: e.timeZone,
        kind,
        future: Date.parse(at) > now.getTime(),
        source: { label: e.name, url: path },
        sections: [],
      });
    }
    if (e.registration) {
      const r = e.registration;
      const available =
        !registrationPaused &&
        privacyConfigured &&
        enrollmentState(e, now) === "open";
      add(
        "registration",
        "opens",
        available ? tr("Registration is open") : tr("Registration window"),
        tr(
          "Configured registration window: {opens} to {closes}. {availability}",
          {
            opens: formatDate(r.opensAt, e.timeZone, tr.locale),
            closes: formatDate(r.closesAt, e.timeZone, tr.locale),
            availability: available
              ? tr("Applications are currently accepted.")
              : tr(
                  "Applications require enabled registration and an available tournament; check the registration page for current availability.",
                ),
          },
        ),
        r.opensAt,
        `/tournaments/${e.slug}/register`,
      );
      add(
        "registration",
        "closes",
        Date.parse(r.closesAt) <= now.getTime()
          ? tr("Registration window ended")
          : tr("Registration closing deadline"),
        tr("The configured registration window ends at {time}.", {
          time: formatDate(r.closesAt, e.timeZone, tr.locale),
        }),
        r.closesAt,
        `/tournaments/${e.slug}/register`,
      );
      if (r.withdrawUntil)
        add(
          "registration",
          "withdrawal",
          tr("Withdrawal deadline"),
          tr(
            "The configured withdrawal cutoff is {time}. Available actions depend on the application's status and tournament lock.",
            { time: formatDate(r.withdrawUntil, e.timeZone, tr.locale) },
          ),
          r.withdrawUntil,
          `/tournaments/${e.slug}/register`,
        );
    }
    for (const entry of e.schedule)
      if (entry.at) {
        add(
          "schedule",
          JSON.stringify([entry.label, entry.at]),
          tr("Scheduled: {label}", { label: entry.label }),
          tr(
            "{label} is scheduled for {time}. This published date is a plan, not confirmation that the event took place.",
            {
              label: entry.label,
              time: formatDate(entry.at, e.timeZone, tr.locale),
            },
          ),
          entry.at,
          `/tournaments/${e.slug}/schedule`,
        );
      }
    for (const event of events.filter(
      (v) => v.editionSlug === e.slug && Date.parse(v.at) <= now.getTime(),
    ))
      add(
        event.kind,
        event.id,
        event.title,
        event.summary,
        event.at,
        event.url,
      );
  }
  return [...new Map(items.map((item) => [item.slug, item])).values()].sort(
    (a, b) =>
      Number(a.future) - Number(b.future) ||
      (a.future
        ? Date.parse(a.at) - Date.parse(b.at)
        : Date.parse(b.at) - Date.parse(a.at)) ||
      a.slug.localeCompare(b.slug),
  );
}
