import { StreamingManager } from "@/components/streaming-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { remotePage } from "@/lib/remote-page";
import { streamingWorkspace } from "@/lib/streaming-workspace";
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
    const actor = await requireUser();
    const data = await streamingWorkspace(actor, edition, {
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
        <StreamingManager slug={edition} data={data} />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
