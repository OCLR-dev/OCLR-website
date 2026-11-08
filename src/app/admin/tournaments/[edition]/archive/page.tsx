import { ArchiveImporter } from "@/components/archive-importer";
import { ArchiveSourceRecords } from "@/components/archive-source-records";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff-request";
import { remotePage } from "@/lib/remote-page";
import { tournamentForAdmin } from "@/lib/tournaments";
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  return authorizedPage(async () => {
    const tr = await getAppTranslations();
    const data = await tournamentForAdmin(
      await requireStaff(),
      (await params).edition,
    );
    return (
      <>
        <PageHeading title={tr("Historical archive")} />
        <ArchiveImporter
          slug={data.edition.slug}
          revision={data.revision}
          published={data.edition.published}
          eligible={
            data.edition.status === "completed" && !data.edition.registration
          }
          archive={data.edition.archive}
        />
        {data.edition.archive && (
          <details data-archive-appendix>
            <summary>{tr("Historical source appendix")}</summary>
            <ArchiveSourceRecords archive={data.edition.archive} />
            <details>
              <summary>{tr("All import fields")}</summary>
              <pre className="archive-json">
                {JSON.stringify(data.edition.archive, null, 2)}
              </pre>
            </details>
          </details>
        )}
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
