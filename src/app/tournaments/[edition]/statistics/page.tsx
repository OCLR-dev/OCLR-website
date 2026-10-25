import { EventStatistics } from "@/components/event-statistics";
import { publicArchiveStatistics } from "@/lib/archive-statistics";
import { getPublicEdition } from "@/lib/content";
import { previewScores, type EventScore } from "@/lib/event-statistics";
import { HttpError } from "@/lib/http";
import { remotePage } from "@/lib/remote-page";
import { notFound } from "next/navigation";
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const { edition: slug } = await params;
  if (!(await getPublicEdition(slug))) notFound();
  const preview = previewScores(slug);
  if (preview) return <EventStatistics scores={preview} />;
  let scores: EventScore[] = [];
  try {
    const data = await publicArchiveStatistics(slug);
    scores = data.plays.map((p) => ({
      player:
        data.players.find((u) => u.osuId === p.osuId)?.username ??
        String(p.osuId),
      team: data.teams.find((t) => t.id === p.teamId)?.name ?? p.teamId,
      round: p.stage,
      slot: p.slot,
      title: p.title,
      mapId: p.beatmapId,
      score: p.score,
      accuracy: p.accuracy,
      combo: p.combo,
      mods: p.mods.join(" "),
      mp: p.mpId,
      game: String(p.gameId),
      fixture: p.fixtureId,
    }));
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 404)) throw error;
  }
  return <EventStatistics scores={scores} />;
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
