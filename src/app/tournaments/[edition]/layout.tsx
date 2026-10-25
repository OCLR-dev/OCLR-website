import "./event-pages.css";
import { frontendTournament } from "@/lib/frontend-data";
import { remoteMode } from "@/lib/data-source";
import { remotePage } from "@/lib/remote-page";
import { getAppTranslations } from "@/i18n/server";
import { TournamentShell } from "@/components/tournament-navigation";
import { notFound } from "next/navigation";
import { publicDraft } from "@/lib/draft";
import { getPublicEdition } from "@/lib/content";
import { informationPreview } from "@/lib/tournament-information";
export const dynamic = "force-dynamic";
export default async function EditionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ edition: string }>;
}) {
  if (remoteMode())
    return remotePage(async () => {
      const { edition: slug } = await params;
      const edition = await frontendTournament(slug);
      return (
        <TournamentShell
          slug={slug}
          name={edition.name}
          liveDraft={
            edition.overview.kind === "database" &&
            Boolean(edition.overview.draft)
          }
          archived={edition.source.kind === "historical_archive"}
        >
          {children}
        </TournamentShell>
      );
    });
  const tr = await getAppTranslations();

  const { edition: slug } = await params;
  const edition = await getPublicEdition(slug);
  if (!edition) notFound();
  if (edition.archive)
    return (
      <TournamentShell
        slug={slug}
        name={informationPreview(slug)?.name ?? edition.name}
        liveDraft={false}
        archived
      >
        {children}
      </TournamentShell>
    );
  const [draftResult] = await Promise.allSettled([publicDraft(slug)]);
  const draft = draftResult.status === "fulfilled" ? draftResult.value : null;
  const liveUnavailable = draftResult.status === "rejected";
  return (
    <TournamentShell
      slug={slug}
      name={informationPreview(slug)?.name ?? edition.name}
      liveDraft={Boolean(draft)}
    >
      {liveUnavailable && (
        <p className="notice" role="status">
          {tr(
            "Live tournament information is temporarily unavailable. Confirmed rules and dates remain accessible.",
          )}
        </p>
      )}
      {children}
    </TournamentShell>
  );
}
