import { frontendTournament } from "@/lib/frontend-data";
import { remoteMode } from "@/lib/data-source";
import { remotePage } from "@/lib/remote-page";
import { historicalPage } from "@/components/historical-archive";
import { hasEligibilityLimits } from "@/lib/eligibility-model";
import { getAppTranslations } from "@/i18n/server";
import { RulesHandbook } from "@/components/rules-handbook";
import { notFound } from "next/navigation";
import { getPublicEdition } from "@/lib/content";
import { Action, EmptyState, PageHeading } from "@/components/ui";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Tournament rules") };
}

async function RulesContent({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  const { edition: slug } = await params;
  const archivePage = await historicalPage(slug, "rules");
  if (archivePage) return archivePage;
  const edition = remoteMode()
    ? await frontendTournament(slug)
    : await getPublicEdition(slug);
  if (!edition) notFound();
  return (
    <>
      <PageHeading title={tr("Rules")} />

      {hasEligibilityLimits(edition.automaticEligibility) && (
        <section className="panel">
          <h2>
            {tr("Automatic eligibility")} · {"osu!standard"}
          </h2>
          <ul>
            {Object.entries(edition.automaticEligibility!)
              .filter(([, v]) => v !== null)
              .map(([key, v]) => (
                <li key={key}>
                  {key.endsWith("Pp") ? "PP" : tr("Global Rank")}{" "}
                  {key.startsWith("min") ? "≥" : "≤"} {v}
                </li>
              ))}
          </ul>
        </section>
      )}
      {edition.rules ? (
        <>
          <p className="rules-version muted small">
            {tr("Version ")}
            {edition.rules.version} · {edition.rules.sections.length}{" "}
            {tr("sections")}
          </p>
          <RulesHandbook sections={edition.rules.sections} />
        </>
      ) : (
        <>
          <EmptyState title={tr("Rules to be announced")}>
            {tr(
              "Rules have not been published for this edition. Check the registration page for current availability.",
            )}
          </EmptyState>
          <div className="actions spaced">
            <Action href={`/tournaments/${slug}/register`} secondary>
              {tr("View registration")}
            </Action>
          </div>
        </>
      )}
      <p className="small muted spaced">
        {tr(
          "Accepted registrations automatically appear in this tournament’s public Players directory with their osu! username, osu! ID and participation status. Application answers and review notes stay private.",
        )}
      </p>
    </>
  );
}

export default function Rules(props: Parameters<typeof RulesContent>[0]) {
  return remotePage(() => RulesContent(props));
}
