import { RefereePanel } from "@/components/referee-panel";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { remotePage } from "@/lib/remote-page";
import { refereeWorkspace } from "@/lib/referee-workspace";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Referee panel") };
}
async function RefereePage({
  params,
}: {
  params: Promise<{ edition: string; fixtureId: string }>;
}) {
  return authorizedPage(async () => {
    const { edition, fixtureId } = await params;
    const data = await refereeWorkspace(
      await requireUser(),
      edition,
      fixtureId,
    );
    return <RefereePanel data={data} slug={edition} />;
  });
}

export default function Page(props: Parameters<typeof RefereePage>[0]) {
  return remotePage(() => RefereePage(props));
}
