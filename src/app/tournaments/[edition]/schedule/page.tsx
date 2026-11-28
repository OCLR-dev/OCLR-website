import { EventSchedule } from "@/components/event-schedule";
import { historicalPage } from "@/components/historical-archive";
import { getAppTranslations } from "@/i18n/server";
import { getPublicEdition } from "@/lib/content";
import { formatDate } from "@/lib/editions";
import { eventPreview, type EventMatch } from "@/lib/event-preview";
import {
  publicCompetition,
  type PublicFixture,
} from "@/lib/public-competition";
import { remotePage } from "@/lib/remote-page";
import { notFound } from "next/navigation";

function openingStage(fixtures: PublicFixture[], now = Date.now()) {
  const live = fixtures.find((fixture) => fixture.status === "in_progress");
  if (live) return live.stage;

  const dated = fixtures
    .map((fixture) => ({
      fixture,
      startsAt: Date.parse(fixture.scheduledAt ?? ""),
    }))
    .filter(
      ({ fixture, startsAt }) =>
        fixture.status !== "cancelled" && Number.isFinite(startsAt),
    )
    .sort((a, b) => a.startsAt - b.startsAt);
  const upcoming = dated.find(
    ({ fixture, startsAt }) =>
      startsAt >= now && fixture.status === "scheduled" && !fixture.result,
  )?.fixture;
  const unscheduled = fixtures.find(
    (fixture) =>
      !fixture.scheduledAt && fixture.status === "scheduled" && !fixture.result,
  );
  return (upcoming ?? unscheduled ?? dated.at(-1)?.fixture)?.stage;
}

async function Issue271Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { edition: slug } = await params;
  const { status } = await searchParams;
  const statusFilter =
    status === "recorded" || status === "unconfirmed" ? status : "all";
  const archive = await historicalPage(
    slug,
    "schedule",
    undefined,
    statusFilter,
  );
  if (archive) return archive;
  if (!(await getPublicEdition(slug))) notFound();
  const preview = eventPreview(slug);
  if (preview)
    return (
      <EventSchedule
        edition={slug}
        matches={preview.matches}
        timeZone="UTC+8"
      />
    );
  const [competition, tr] = await Promise.all([
    publicCompetition(slug),
    getAppTranslations(),
  ]);
  const fixtures = competition?.fixtures ?? [];
  const matches: EventMatch[] = fixtures.map((f) => ({
    id: f.id,
    label: f.label,
    round: f.roundName,
    roundId: f.roundId,
    stage: f.stage,
    sides: [f.home, f.away],
    pool: f.pool?.name ?? "—",
    time:
      f.confirmed && f.scheduledAt
        ? formatDate(f.scheduledAt, f.timeZone, tr.locale)
        : "—",
    red: f.home.team?.name ?? f.home.label,
    blue: f.away.team?.name ?? f.away.label,
    score: f.result ? [f.result.homeWins, f.result.awayWins] : null,
    winner: f.result?.winnerTeamId
      ? f.result.winnerTeamId === f.home.team?.id
        ? 0
        : f.result.winnerTeamId === f.away.team?.id
          ? 1
          : null
      : null,
    status: f.status,
    mp: f.result?.mpUrl ?? undefined,
    vod: f.result?.vodUrl ?? undefined,
    sourceRed: f.home.sourceId ?? undefined,
    sourceBlue: f.away.sourceId ?? undefined,
    href: `/tournaments/${slug}/matches/${f.id}`,
  }));
  return (
    <EventSchedule
      edition={slug}
      matches={matches}
      groups={competition?.groups}
      defaultPhase={openingStage(fixtures)}
    />
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
