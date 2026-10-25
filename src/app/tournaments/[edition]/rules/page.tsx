import { frontendTournament } from "@/lib/frontend-data";
import { remotePage } from "@/lib/remote-page";
import { rulesSectionIds } from "@/lib/rules-navigation";
import { LegacyRulesRedirect } from "@/components/legacy-rules-redirect";
import { HttpError } from "@/lib/http";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const { edition } = await params;
  return {
    alternates: {
      canonical: `/tournaments/${encodeURIComponent(edition)}#rules`,
    },
    robots: { index: false, follow: true },
  };
}

export default function Rules({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  return remotePage(async () => {
    const { edition: slug } = await params;
    // Use the public read model so private editions/rules cannot supply redirect targets.
    const edition = await frontendTournament(slug).catch((error) => {
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    });
    const sections =
      edition.overview.kind === "historical_archive"
        ? (edition.overview.rulebook?.sections ?? [])
        : (edition.rules?.sections ?? []);
    const anchors = Object.fromEntries(
      rulesSectionIds(sections.map((s) => s.heading)).flatMap((id, index) => {
        if (edition.overview.kind === "historical_archive") return [[id, id]];
        // Preview documents can differ from the saved rulebook, so use the safe section fallback.
        if (edition.overview.kind === "preview") return [];
        return [[id, `rules-${index + 1 + (edition.eligibility ? 1 : 0)}`]];
      }),
    );
    return (
      <LegacyRulesRedirect
        base={`/tournaments/${encodeURIComponent(slug)}`}
        anchors={anchors}
      />
    );
  });
}
