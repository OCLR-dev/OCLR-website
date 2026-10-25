import { AwardManager } from "@/components/award-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { awardWorkspace } from "@/lib/awards";
import { remotePage } from "@/lib/remote-page";
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();
  return authorizedPage(async () => (
    <>
      <PageHeading title={tr("Weekly awards")} />
      <AwardManager
        initial={await awardWorkspace(
          await requireUser(),
          (await params).edition,
        )}
      />
    </>
  ));
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
