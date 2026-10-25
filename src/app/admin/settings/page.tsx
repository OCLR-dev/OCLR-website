import { SiteAppearanceForm } from "@/components/site-appearance-form";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { remotePage } from "@/lib/remote-page";
import { siteSettingsForAdmin } from "@/lib/site-settings";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Site settings") };
}
async function Issue271Page() {
  return authorizedPage(async () => {
    const tr = await getAppTranslations();
    const settings = await siteSettingsForAdmin(await requireUser());
    return (
      <>
        <PageHeading
          eyebrow={tr("ADMINISTRATION")}
          title={tr("Site settings")}
        />
        <SiteAppearanceForm
          initialAppearance={settings.defaultAppearance}
          revision={settings.revision}
        />
      </>
    );
  });
}

export default function Page() {
  return remotePage(() => Issue271Page());
}
