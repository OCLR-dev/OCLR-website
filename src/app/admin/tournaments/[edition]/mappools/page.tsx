import { MappoolEditor } from "@/components/mappool-editor";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { hasCapability } from "@/lib/auth/staff";
import { requireUser } from "@/lib/auth/user";
import { mappoolWorkspace } from "@/lib/mappools";
import { remotePage } from "@/lib/remote-page";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Manage mappools") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireUser();
    const { edition } = await params;
    const data = await mappoolWorkspace(actor, edition);
    return (
      <>
        <PageHeading
          eyebrow={tr("COMPETITION MAPS")}
          title={tr("Mappool management")}
        />
        <MappoolEditor
          slug={edition}
          data={data}
          readOnlyMaps={
            !(await hasCapability(actor, "manage_mappools", edition))
          }
          canManageReplays={await hasCapability(
            actor,
            "manage_replays",
            edition,
          )}
        />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
