import { Action, EmptyState, PageHeading } from "@/components/ui";
import { OwnTeam } from "@/components/own-team";
import { getAppTranslations } from "@/i18n/server";
import { currentUser } from "@/lib/auth/user";
import { remotePage } from "@/lib/remote-page";
import { ownTeam } from "@/lib/teams";
import { redirect } from "next/navigation";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("My captain team"),
    robots: { index: false, follow: false },
  };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  const user = await currentUser();
  if (!user) redirect("/login");
  const { edition } = await params;
  const team = await ownTeam(user.osuId, edition);
  return (
    <>
      <PageHeading eyebrow={tr("CAPTAIN WORKSPACE")} title={tr("My team")}>
        {tr(
          "Your assigned edition team. Roster changes are made through the draft.",
        )}
      </PageHeading>
      {team ? (
        <OwnTeam
          team={team}
          edition={edition}
          actions={
            <Action
              href={`/tournaments/${edition}/schedule/requests`}
              secondary
            >
              {tr("Schedule requests")}
            </Action>
          }
        />
      ) : (
        <EmptyState title={tr("No captain team assigned")}>
          {tr(
            "Captain appointments and team configuration are managed by staff for each edition.",
          )}
        </EmptyState>
      )}
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
