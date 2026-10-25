import { StatisticsManager } from "@/components/statistics-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { statisticsWorkspace } from "@/lib/archive-statistics";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff";
import { remotePage } from "@/lib/remote-page";
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  return authorizedPage(async () => {
    const tr = await getAppTranslations();
    const data = await statisticsWorkspace(
      await requireStaff(),
      (await params).edition,
    );
    return (
      <>
        <PageHeading title={tr("Historical statistics")} />
        <StatisticsManager initial={data} />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
