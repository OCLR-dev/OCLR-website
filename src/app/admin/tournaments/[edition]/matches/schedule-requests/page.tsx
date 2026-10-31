import { ScheduleManager } from "@/components/schedule-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { assertCapability } from "@/lib/auth/staff";
import { scheduleWorkspace } from "@/lib/schedule";
export default async function Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  return authorizedPage(async () => {
    const actor = await requireUser();
    const { edition } = await params;
    await assertCapability(actor, "manage_fixtures", edition);
    const tr = await getAppTranslations();
    return (
      <>
        <PageHeading title={tr("Review schedule requests")} />
        <ScheduleManager
          slug={edition}
          data={await scheduleWorkspace(actor, edition)}
        />
      </>
    );
  });
}
