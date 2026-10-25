import { CaptainManager } from "@/components/captain-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff";
import { captainSetup } from "@/lib/captains";
import { remotePage } from "@/lib/remote-page";
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireStaff();
    const { edition } = await params;
    const setup = await captainSetup(actor, edition);
    const identities = await (
      await import("@/lib/frontend-read-models")
    ).captainIdentities(actor, edition);
    return (
      <>
        <PageHeading
          eyebrow={tr("PARTICIPANTS")}
          title={tr("Captains & player pool")}
        />
        <p className="small muted">
          {tr("Setup ")}
          {setup.locked ? tr("locked") : tr("unlocked")}
        </p>
        <CaptainManager slug={edition} setup={setup} identities={identities} />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
