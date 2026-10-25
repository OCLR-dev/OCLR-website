import { remotePage } from "@/lib/remote-page";
import { notFound } from "next/navigation";
import { historicalPage } from "@/components/historical-archive";
async function HistoricalPlayerContent({
  params,
}: {
  params: Promise<{ edition: string; osuId: string }>;
}) {
  const { edition, osuId } = await params;
  const page = await historicalPage(edition, "player", osuId);
  if (!page) notFound();
  return page;
}

export default function HistoricalPlayer(
  props: Parameters<typeof HistoricalPlayerContent>[0],
) {
  return remotePage(() => HistoricalPlayerContent(props));
}
