import { PlayerTimetable } from "@/components/player-timetable";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import {
  assertDirectPlayerWorkspace,
  playerTimetableWorkspace,
} from "@/lib/player-workspace";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Season timetable"),
    robots: { index: false, follow: false },
  };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ player?: string }>;
}) {
  return authorizedPage(async () => {
    assertDirectPlayerWorkspace();
    const actor = await requireUser();
    const { edition } = await params;
    const { player } = await searchParams;
    const tr = await getAppTranslations();
    const data = await playerTimetableWorkspace(
      actor,
      edition,
      player === undefined ? actor.osuId : Number(player),
    );
    return (
      <>
        <PageHeading
          eyebrow={tr("PLAYER WORKSPACE")}
          title={tr("Season timetable")}
        >
          {tr(
            "Set your available times for this season, even before matches are scheduled.",
          )}
        </PageHeading>
        <PlayerTimetable
          key={`${data.owner.osuId}-${data.version}`}
          slug={edition}
          data={data}
        />
      </>
    );
  });
}
