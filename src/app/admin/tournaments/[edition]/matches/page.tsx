import { redirect } from "next/navigation";
import { FixtureManager } from "@/components/fixture-manager";
import { StreamingManager } from "@/components/streaming-manager";
import { Action, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { canRead, staffAccess } from "@/lib/auth/staff";
import { requireUser } from "@/lib/auth/user";
import { staffFixtures } from "@/lib/fixtures";
import { remotePage } from "@/lib/remote-page";
import { canViewStreaming, streamingWorkspace } from "@/lib/streaming";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Competition fixtures") };
}

async function Issue271Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireUser();
    const { edition } = await params;
    const access = await staffAccess(actor);
    if (
      canViewStreaming(access, edition) &&
      !canRead(access, "manage_fixtures", edition) &&
      !canRead(access, "record_results", edition)
    ) {
      const data = await streamingWorkspace(actor, edition);
      return (
        <>
          <PageHeading
            eyebrow={tr("COMPETITION")}
            title={tr("Streaming tasks")}
          />
          <StreamingManager slug={edition} data={data} />
        </>
      );
    }
    const data = await staffFixtures(actor, edition);
    if (
      (await searchParams)?.view === "configuration" &&
      (data.canManage || data.canViewAll)
    )
      redirect(`/admin/tournaments/${edition}/rounds#competition`);
    return (
      <>
        <PageHeading
          eyebrow={tr("COMPETITION")}
          title={
            data.canManage
              ? tr("Fixtures & results")
              : tr("My assigned matches")
          }
        />
        {data.canManage && (
          <div className="actions">
            <Action
              href={`/admin/tournaments/${edition}/matches/schedule-requests`}
              secondary
            >
              {tr("Review schedule requests")}
            </Action>
          </div>
        )}
        <FixtureManager slug={edition} data={data} />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
