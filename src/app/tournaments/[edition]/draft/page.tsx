import { historicalPage } from "@/components/historical-archive";
import { LiveDraft } from "@/components/live-draft";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { assertReadCapability } from "@/lib/auth/staff";
import { requireUser } from "@/lib/auth/user";
import { publicDraftResults } from "@/lib/broadcast";
import { remotePage } from "@/lib/remote-page";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Live draft") };
}

async function Issue271Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ presenter?: string }>;
}) {
  const tr = await getAppTranslations();

  const { edition } = await params;
  const archivePage = await historicalPage(edition, "draft");
  if (archivePage) return archivePage;
  const presenter = (await searchParams).presenter === "1";
  if (presenter)
    return authorizedPage(async () => {
      await assertReadCapability(
        await requireUser(),
        "view_streaming",
        edition,
      );
      return (
        <LiveDraft
          slug={edition}
          initial={await publicDraftResults(edition)}
          presenter
        />
      );
    });
  return (
    <>
      {!presenter && (
        <>
          <PageHeading
            eyebrow={tr("THE TEAM STORY STARTS HERE")}
            title={tr("Captain draft")}
          >
            {tr(
              "Follow each captain’s picks by round and see how the teams take shape.",
            )}
          </PageHeading>
        </>
      )}
      <LiveDraft
        slug={edition}
        initial={await publicDraftResults(edition)}
        presenter={presenter}
      />
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
