import { historicalPage } from "@/components/historical-archive";
import { PublicMappools } from "@/components/public-mappools";
import { EmptyState, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { publicMappools } from "@/lib/mappool-reads";
import { remotePage } from "@/lib/remote-page";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Published mappools") };
}
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();
  const { edition } = await params;
  const archivePage = await historicalPage(edition, "mappools");
  if (archivePage) return archivePage;
  const pools = await publicMappools(edition);
  return (
    <>
      <PageHeading title={tr("Mappools")} />
      {pools.length ? (
        <PublicMappools pools={pools} slug={edition} />
      ) : (
        <EmptyState title={tr("No mappools published")}>
          {tr("Organizers will release the approved maps here.")}
        </EmptyState>
      )}
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
