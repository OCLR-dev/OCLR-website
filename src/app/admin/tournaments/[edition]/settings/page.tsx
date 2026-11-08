import { TournamentEditor } from "@/components/tournament-editor";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { hasCapability } from "@/lib/auth/staff";
import { requireStaff } from "@/lib/auth/staff-request";
import { remotePage } from "@/lib/remote-page";
import { tournamentForAdmin } from "@/lib/tournaments";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Tournament settings") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const { edition } = await params;
    const actor = await requireStaff();
    const data = await tournamentForAdmin(actor, edition);
    return (
      <>
        <PageHeading
          eyebrow={tr("TOURNAMENT CONFIGURATION")}
          title={tr("Tournament settings")}
        />
        <TournamentEditor
          canDeleteDraft={await hasCapability(actor, "configure_tournament")}
          data={{
            edition: data.edition,
            revision: data.revision,
            applications: data.applications,
            registrationPaused: data.registrationPaused,
            readiness: data.readiness,
          }}
        />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
