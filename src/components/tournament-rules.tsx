import type { PublicTournament } from "@/lib/read-api-contract";
import { getAppTranslations } from "@/i18n/server";
import { hasEligibilityLimits } from "@/lib/eligibility-model";
import { EligibilityLimitsSummary } from "./eligibility-summary";
import { RulesHandbook } from "./rules-handbook";
import { Action, EmptyState } from "./ui";

export function tournamentRuleSections(
  edition: Pick<PublicTournament, "rules" | "eligibility">,
  eligibilityHeading: string,
) {
  return [
    ...(edition.eligibility
      ? [{ heading: eligibilityHeading, body: edition.eligibility }]
      : []),
    ...(edition.rules?.sections ?? []),
  ].map((section, index) => ({ ...section, id: `rules-${index + 1}` }));
}

/** The public homepage owns the published rules and their publication state. */
export async function TournamentRules({
  edition,
  sections,
  showContents = true,
}: {
  edition: Pick<
    PublicTournament,
    "slug" | "rules" | "eligibility" | "automaticEligibility"
  >;
  sections: ReturnType<typeof tournamentRuleSections>;
  showContents?: boolean;
}) {
  const tr = await getAppTranslations();
  return (
    <>
      {hasEligibilityLimits(edition.automaticEligibility) && (
        <section className="panel">
          <h3>
            {tr("Automatic eligibility")} · {"osu!standard"}
          </h3>
          <EligibilityLimitsSummary limits={edition.automaticEligibility!} />
        </section>
      )}
      {edition.rules && (
        <p className="rules-version muted small">
          {tr("Version ")}
          {edition.rules.version} · {sections.length} {tr("sections")}
        </p>
      )}
      {sections.length > 0 && (
        <RulesHandbook sections={sections} showContents={showContents} />
      )}
      {!edition.rules && (
        <>
          <EmptyState title={tr("Rules to be announced")}>
            {tr(
              "Rules have not been published for this edition. Check the registration page for current availability.",
            )}
          </EmptyState>
          <div className="actions spaced">
            <Action href={`/tournaments/${edition.slug}/register`} secondary>
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
