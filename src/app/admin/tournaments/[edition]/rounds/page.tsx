import { RoundManager } from "@/components/round-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { mappoolWorkspace } from "@/lib/mappools";
import { remotePage } from "@/lib/remote-page";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Round management") };
}
async function Issue271Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ round?: string; stage?: string }>;
}) {
  return authorizedPage(async () => {
    const tr = await getAppTranslations();
    const { edition } = await params;
    // Reuse the authoritative workspace and its edition-scoped permission check.
    const { rounds } = await mappoolWorkspace(await requireUser(), edition);
    const query = await searchParams;
    const selected = rounds.find((round) => round.id === query.round);
    return (
      <>
        <PageHeading
          eyebrow={tr("COMPETITION STRUCTURE")}
          title={tr("Round management")}
        />
        <RoundManager
          slug={edition}
          rounds={rounds}
          initialRoundId={selected?.id}
          initialStage={
            selected?.stage ??
            (query.stage === "knockout" ? "knockout" : "group")
          }
        />
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
