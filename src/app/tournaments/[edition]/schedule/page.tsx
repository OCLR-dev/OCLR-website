import { EventSchedule } from "@/components/event-schedule";
import { historicalPage } from "@/components/historical-archive";
import { getPublicEdition } from "@/lib/content";
import { eventPreview, type EventMatch } from "@/lib/event-preview";
import { publicCompetition } from "@/lib/public-competition";
import { remotePage } from "@/lib/remote-page";
import { notFound } from "next/navigation";
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const { edition: slug } = await params;
  const archive = await historicalPage(slug, "schedule");
  if (archive) return archive;
  if (!(await getPublicEdition(slug))) notFound();
  const preview = eventPreview(slug);
  if (preview)
    return <EventSchedule edition={slug} matches={preview.matches} />;
  const competition = await publicCompetition(slug);
  const matches: EventMatch[] = (competition?.fixtures ?? []).map((f) => ({
    id: f.id,
    round: f.roundName,
    stage: f.stage,
    pool: f.pool?.name ?? "—",
    time:
      f.confirmed && f.scheduledAt
        ? new Date(f.scheduledAt)
            .toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" })
            .slice(0, 16)
        : "—",
    red: f.home.team?.name ?? f.home.label,
    blue: f.away.team?.name ?? f.away.label,
    score: f.result ? [f.result.homeWins, f.result.awayWins] : null,
    status: f.status,
    mp: f.result?.mpUrl,
    sourceRed: f.home.sourceId ?? undefined,
    sourceBlue: f.away.sourceId ?? undefined,
    href: `/tournaments/${slug}/matches/${f.id}`,
  }));
  return (
    <EventSchedule
      edition={slug}
      matches={matches}
      groups={competition?.groups}
    />
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
