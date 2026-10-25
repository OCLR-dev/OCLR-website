import { historicalPage } from "@/components/historical-archive";
import { GroupStandings, PublicMatches } from "@/components/public-matches";
import { RoundRatings } from "@/components/round-ratings";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { getPublicEdition } from "@/lib/content";
import { publicCompetition } from "@/lib/public-competition";
import { publicRoundRatings } from "@/lib/ratings";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import { notFound } from "next/navigation";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Competition results") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  const { edition: slug } = await params;
  const archivePage = await historicalPage(slug, "results");
  if (archivePage) return archivePage;
  const edition = await getPublicEdition(slug);
  if (!edition) notFound();
  const data = await publicCompetition(slug);
  return (
    <>
      <PageHeading title={tr("Results")} />
      <p>
        <Link href={`/tournaments/${slug}/results/awards`}>
          {tr("Weekly awards")} →
        </Link>
      </p>
      <PublicMatches
        fixtures={data?.fixtures ?? []}
        slug={slug}
        groups={data?.groups ?? []}
      />
      <RoundRatings slug={slug} data={await publicRoundRatings(slug)} />
      <GroupStandings groups={data?.groups ?? []} slug={slug} />
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
