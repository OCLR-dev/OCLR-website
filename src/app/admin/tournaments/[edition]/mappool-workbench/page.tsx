import { SelectionWorkbench } from "@/components/mappool-workbench";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { hasCapability } from "@/lib/auth/staff";
import { requireUser } from "@/lib/auth/user";
import { selectionWorkspace } from "@/lib/mappool-workbench";
import { mappoolWorkspace } from "@/lib/mappools";
import { remotePage } from "@/lib/remote-page";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Map selection workbench") };
}
export default function Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  return remotePage(() =>
    authorizedPage(async () => {
      const actor = await requireUser();
      const { edition } = await params;
      const data = await selectionWorkspace(actor, edition);
      const writable =
        !data.archived &&
        (await hasCapability(actor, "select_mappools", edition));
      const officialPools =
        writable && (await hasCapability(actor, "manage_mappools", edition))
          ? await mappoolWorkspace(actor, edition)
          : null;
      const tr = await getAppTranslations();
      return (
        <>
          <PageHeading
            eyebrow={tr("COMPETITION MAPS")}
            title={tr("Map selection workbench")}
          />
          <SelectionWorkbench
            slug={edition}
            initialData={data}
            writable={writable}
            viewerId={actor.osuId}
            officialPools={officialPools}
          />
        </>
      );
    }),
  );
}
