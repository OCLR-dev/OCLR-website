import { PlayerPractice } from "@/components/player-practice";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import {
  assertDirectPlayerWorkspace,
  playerPracticeWorkspace,
} from "@/lib/player-workspace";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Practice sheet"),
    robots: { index: false, follow: false },
  };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ pool?: string }>;
}) {
  return authorizedPage(async () => {
    assertDirectPlayerWorkspace();
    const actor = await requireUser();
    const { edition } = await params;
    const { pool } = await searchParams;
    const tr = await getAppTranslations();
    const data = await playerPracticeWorkspace(actor, edition, pool);
    return (
      <>
        <PageHeading
          eyebrow={tr("PLAYER WORKSPACE")}
          title={tr("Practice sheet")}
        >
          {tr(
            "Published mappools load automatically. Record your scores, ratings and comments for your team.",
          )}
        </PageHeading>
        <PlayerPractice slug={edition} data={data} />
      </>
    );
  });
}
