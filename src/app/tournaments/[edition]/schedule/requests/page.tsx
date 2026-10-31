import { ScheduleManager } from "@/components/schedule-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { scheduleWorkspace } from "@/lib/schedule";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Schedule requests"),
    robots: { index: false, follow: false },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  return authorizedPage(async () => {
    const actor = await requireUser();
    const { edition } = await params;
    const tr = await getAppTranslations();
    const data = await scheduleWorkspace(actor, edition);
    return (
      <>
        <PageHeading title={tr("Schedule requests")} />
        <ScheduleManager slug={edition} data={data} />
      </>
    );
  });
}
