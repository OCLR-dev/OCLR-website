import { authorizedPage } from "@/lib/auth/page";
import { requireBackupActor } from "@/lib/auth/backup-request";
import { getAppTranslations } from "@/i18n/server";
import { PageHeading } from "@/components/ui";
import { BackupManager } from "@/components/backup-manager";
export default async function Page() {
  return authorizedPage(async () => {
    await requireBackupActor();
    const tr = await getAppTranslations();
    return (
      <>
        <PageHeading title={tr("Database backups")} />
        <BackupManager />
      </>
    );
  });
}
