import { historicalPage } from "@/components/historical-archive";
import { MappoolBrowser } from "@/components/mappool-browser";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { publicMappools } from "@/lib/mappools";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import { notFound } from "next/navigation";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Mappool") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string; poolId: string }>;
}) {
  const tr = await getAppTranslations();

  const { edition, poolId } = await params;
  const archivePage = await historicalPage(edition, "pool", poolId);
  if (archivePage) return archivePage;
  const [pool] = await publicMappools(edition, poolId);
  if (!pool) notFound();
  return (
    <>
      <Link className="context-link" href={`/tournaments/${edition}/mappools`}>
        {tr("← All mappools")}
      </Link>
      <PageHeading
        eyebrow={`${tr(pool.stage === "group" ? "Group Stage" : "Knockout Stage")} / ${pool.roundName}`}
        title={pool.name}
      >
        {tr("Published · Last updated ")}
        {pool.updatedAt.toISOString()}
      </PageHeading>
      <MappoolBrowser slug={edition} pool={pool} />
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
