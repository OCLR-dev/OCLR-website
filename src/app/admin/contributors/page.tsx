import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { contributorsForAdmin } from "@/lib/contributors";
import { PageHeading } from "@/components/ui";
import { ContributorManager } from "@/components/contributor-manager";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Contributor management") };
}
export default async function ContributorsPage() {
  return authorizedPage(async () => {
    const tr = await getAppTranslations();
    const directory = await contributorsForAdmin(await requireUser());
    return (
      <>
        <PageHeading
          eyebrow={tr("ADMINISTRATION")}
          title={tr("Contributor management")}
        />
        <ContributorManager initial={directory} />
      </>
    );
  });
}
