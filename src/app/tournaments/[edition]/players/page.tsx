import {
  frontendViewer,
  frontendPlayers,
  frontendTournament,
} from "@/lib/frontend-data";
import { remoteMode } from "@/lib/data-source";
import { remotePage } from "@/lib/remote-page";

import { EventPlayers } from "@/components/event-players";
import { eventPreview } from "@/lib/event-preview";
import { historicalPage } from "@/components/historical-archive";
import { getAppTranslations } from "@/i18n/server";
import { publicPlayers, publicPlayerFilters } from "@/lib/players";
import { directoryKeys, publicDirectoryPlayer } from "@/lib/player-directory";
import { HttpError } from "@/lib/http";
import { getPublicEdition } from "@/lib/content";
import { notFound } from "next/navigation";
import { Action, PageHeading } from "@/components/ui";
import { after } from "next/server";
import { refreshDirectoryStatistics } from "@/lib/osu-profiles";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Players"),
    description: tr(
      "Accepted players and announced teams for this OCLR tournament.",
    ),
  };
}

async function PlayersContent({
  searchParams,
  params,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tr = await getAppTranslations();

  const { edition } = await params;
  const archivePage = await historicalPage(edition, "players");
  if (archivePage) return archivePage;
  const currentEdition = remoteMode()
    ? await frontendTournament(edition)
    : await getPublicEdition(edition);
  if (!currentEdition) notFound();
  const preview = remoteMode() ? null : eventPreview(edition);
  if (preview)
    return (
      <>
        <PageHeading title={tr("Players")} />
        <EventPlayers edition={edition} players={preview.players} preview />
      </>
    );
  const base = `/tournaments/${edition}/players`;
  try {
    const query = await searchParams;
    publicPlayerFilters({ edition, page: query.page });
    if (
      Object.keys(query).some(
        (key) => ![...directoryKeys, "page", "view"].includes(key),
      ) ||
      (query.view !== undefined &&
        !["cards", "list"].includes(String(query.view)))
    )
      throw new HttpError(400, "Choose valid player filters and sorting.");
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 400) throw error;
    return (
      <div className="directory-page edition-players">
        <PageHeading title={tr("Players")}>{tr(error.message)}</PageHeading>
        <Action href={base}>{tr("Clear filters")}</Action>
      </div>
    );
  }
  // Filtering runs over the complete public collection, including remote pages.
  const { rows, refreshIds } = await frontendPlayers(edition);
  if (refreshIds.length)
    after(async () => {
      try {
        // A publication or registration decision may change after rendering.
        const current = await publicPlayers({ edition });
        const visible = new Set(current.rows.map((p) => p.osuId));
        await refreshDirectoryStatistics(
          refreshIds.filter((id) => visible.has(id)),
        );
      } catch {
        // Stats refresh must never prevent an otherwise usable public directory.
      }
    });
  const viewer = await frontendViewer();
  return (
    <div className="directory-page edition-players">
      <PageHeading title={tr("Players")} />
      <EventPlayers
        edition={edition}
        remote={remoteMode()}
        signedIn={Boolean(viewer)}
        viewerId={viewer?.osuId}
        grouped={rows.some((p) => p.participation === "finalized_roster")}
        players={rows.map((p) => ({
          ...publicDirectoryPlayer(p),
          team: p.team?.name ?? null,
          captain: p.captain,
          bio: p.bio ?? undefined,
          href: `/players/${p.osuId}?edition=${edition}`,
          fetchedAt: p.statistics.fetchedAt ?? undefined,
        }))}
      />
    </div>
  );
}

export default function Players(props: Parameters<typeof PlayersContent>[0]) {
  return remotePage(() => PlayersContent(props));
}
