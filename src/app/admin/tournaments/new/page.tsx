import { CreateTournamentForm } from "@/components/tournament-editor";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { assertReadCapability } from "@/lib/auth/staff";
import { requireUser } from "@/lib/auth/user";
import { remotePage } from "@/lib/remote-page";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Create tournament") };
}

async function Issue271Page() {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    await assertReadCapability(await requireUser(), "configure_tournament");
    return (
      <>
        <PageHeading
          eyebrow={tr("TOURNAMENT MANAGEMENT")}
          title={tr("Create tournament")}
        >
          {tr("Start with a name. Add details when you’re ready.")}
        </PageHeading>
        <CreateTournamentForm />
      </>
    );
  });
}

export default function Page() {
  return remotePage(() => Issue271Page());
}
