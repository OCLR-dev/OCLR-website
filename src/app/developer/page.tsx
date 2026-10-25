import { remoteMode } from "@/lib/data-source";
import RemotePage from "@/app/remote/page";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireBrowserSession } from "@/lib/auth/user";
import { listDeveloperTokens } from "@/lib/developer-api";
import { DeveloperAccess } from "@/components/developer-access";
import { PageHeading } from "@/components/ui";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Developer API access"),
    robots: { index: false, follow: false },
  };
}
export default async function DeveloperPage() {
  if (remoteMode()) return <RemotePage />;
  return authorizedPage(async () => {
    const tr = await getAppTranslations();
    const context = await listDeveloperTokens(await requireBrowserSession());
    return (
      <div className="container page auth-page">
        <PageHeading title={tr("Developer API access")} />
        <DeveloperAccess
          backend={context.backend}
          origins={context.origins}
          initialTokens={context.tokens}
        />
      </div>
    );
  });
}
