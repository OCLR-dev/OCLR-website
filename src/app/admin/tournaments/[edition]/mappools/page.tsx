import { MappoolEditor } from "@/components/mappool-editor";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { hasCapability } from "@/lib/auth/staff";
import { requireUser } from "@/lib/auth/user";
import { mappoolWorkspace } from "@/lib/mappool-reads";
import { mappoolSuggesterEditorData } from "@/lib/mappool-suggesters";
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
    const suggesters = await mappoolSuggesterEditorData(
      actor,
      edition,
      data.entries,
    );
    return (
      <>
        <PageHeading
          eyebrow={tr("COMPETITION MAPS")}
          title={tr("Mappool management")}
        />
        <MappoolEditor
          slug={edition}
          data={data}
          readOnlyMaps={!suggesters}
          suggesters={suggesters}
          canConfigureShowcase={await hasCapability(
            actor,
            "configure_tournament",
            edition,
          )}
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
