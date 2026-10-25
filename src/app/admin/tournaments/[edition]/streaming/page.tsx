import { ObsSourceLink } from "@/components/obs-source-link";
import { StreamingManager } from "@/components/streaming-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { remotePage } from "@/lib/remote-page";
import { streamingWorkspace } from "@/lib/streaming";
import Link from "next/link";
async function Issue271Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tr = await getAppTranslations();
  return authorizedPage(async () => {
    const { edition } = await params;
    const query = await searchParams;
    const data = await streamingWorkspace(await requireUser(), edition, {
      date: query.date ?? "",
      round: query.round ?? "",
      view: query.view ?? "all",
    });
    return (
      <>
        <PageHeading
          eyebrow={tr("COMPETITION")}
          title={tr("Streaming tasks")}
        />
        <nav className="actions" aria-label={tr("Draft broadcast")}>
          <Link
            className="button secondary"
            href={`/tournaments/${edition}/draft?presenter=1`}
          >
            {tr("Open presenter view")}
          </Link>
          <Link
            className="button secondary"
            href={`/tournaments/${edition}/draft/overlay`}
          >
            {tr("Open broadcast overlay")}
          </Link>
        </nav>
        <ObsSourceLink slug={edition} />
        <StreamingManager slug={edition} data={data} />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
