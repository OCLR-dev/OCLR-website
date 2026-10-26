import { frontendTournament } from "@/lib/frontend-data";
import { remoteMode } from "@/lib/data-source";
import { remotePage } from "@/lib/remote-page";
import { historicalPage } from "@/components/historical-archive";
import { InformationDocument } from "@/components/tournament-information";
import { getAppTranslations } from "@/i18n/server";
import { notFound } from "next/navigation";
import { getPublicEdition } from "@/lib/content";
import { formatDate, publicEditionSummary } from "@/lib/editions";
import {
  informationPreview,
  type TournamentInformation,
} from "@/lib/tournament-information";
import "./information.css";
import { tournamentStages } from "@/lib/tournament-stages";
import {
  TournamentRules,
  tournamentRuleSections,
} from "@/components/tournament-rules";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const { edition } = await params;
  return {
    title:
      (remoteMode() ? undefined : informationPreview(edition)?.name) ??
      (remoteMode()
        ? await frontendTournament(edition)
            .then((e) => e.name)
            .catch(() => undefined)
        : (await getPublicEdition(edition))?.name) ??
      "Tournament",
  };
}

async function OverviewContent({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();
  const { edition: slug } = await params;
  const archivePage = await historicalPage(slug, "overview");
  if (archivePage) return archivePage;
  const edition = await frontendTournament(slug);
  const base = `/tournaments/${slug}`;
  const preview =
    edition.overview.kind === "preview" ? edition.overview.document : null;
  if (preview)
    return (
      <InformationDocument
        document={preview}
        stages={preview.schedule
          .filter((_, index) => index !== 1)
          .map((row, index) => ({
            id: `preview-${index}`,
            label: index === 0 ? tr("Registration phase") : row.event,
            detail: row.date,
            href:
              index === 0
                ? `${base}/register`
                : index === 1
                  ? `${base}/draft`
                  : `${base}/schedule`,
            action:
              index === 0
                ? tr("Register individually")
                : index === 1
                  ? tr("Live draft")
                  : tr("View schedule"),
            state: index === 0 ? "current" : "upcoming",
          }))}
        active={{
          label: tr("Registration phase"),
          detail: tr("Deadline {date}", { date: "11.23 · 23:59 (UTC+8)" }),
          href: `${base}/register`,
          action: tr("Register individually"),
        }}
      />
    );

  if (edition.overview.kind !== "database") notFound();
  const ruleSections = tournamentRuleSections(edition, tr("Eligibility"));
  const {
    teams,
    pools,
    draft,
    nextFixture: fixture,
    unavailable,
    hasFixtures,
  } = edition.overview;
  const state = edition.registration?.state ?? "unannounced";
  const roles = new Map(
    edition.overview.organization.map((entry) => [entry.role, entry.members]),
  );
  const document: TournamentInformation = {
    name: edition.name,
    intro: publicEditionSummary(edition.summary) ?? "",
    banner: edition.branding.background,
    timeZone: edition.timeZone,
    schedule: [
      ...(edition.registration
        ? [
            {
              event: tr("Registration opens"),
              date: formatDate(
                edition.registration.opensAt,
                edition.timeZone,
                tr.locale,
              ),
            },
            {
              event: tr("Registration closes"),
              date: formatDate(
                edition.registration.closesAt,
                edition.timeZone,
                tr.locale,
              ),
            },
          ]
        : []),
      ...edition.schedule
        .filter((event) => event.at)
        .map((event) => ({
          event: event.label,
          date: formatDate(event.at, edition.timeZone, tr.locale),
        })),
    ],
    prizes: [],
    organization: [...roles].map(([role, members]) => ({
      role: tr(role),
      members,
    })),
    links: [
      ...(state === "open"
        ? [{ label: tr("Register individually"), href: `${base}/register` }]
        : []),
      { label: tr("Schedule"), href: `${base}/schedule` },
      { label: tr("Players"), href: `${base}/players` },
      ...(draft ? [{ label: tr("Live draft"), href: `${base}/draft` }] : []),
      ...(hasFixtures
        ? [
            { label: tr("Bracket"), href: `${base}/bracket` },
            { label: tr("Results"), href: `${base}/results` },
          ]
        : []),
    ],
    teams: teams.map((team) => ({
      name: team.name,
      captain: team.captainName,
      members: (team.members ?? [])
        .filter((member) => member.osuId !== team.captainId)
        .map((member) => member.username),
      href: `${base}/teams/${team.id}`,
    })),
    pools: pools.map((pool) => ({
      name: pool.roundName,
      href: `${base}/mappools/${pool.id}`,
      groups: [...new Set(pool.entries.map((entry) => entry.category))].map(
        (category) => ({
          category,
          maps: pool.entries
            .filter((entry) => entry.category === category)
            .map((entry) => ({
              title: entry.title,
              href: entry.href,
            })),
        }),
      ),
    })),
    rules: [], // Published rules render directly from this edition below.
  };
  const active =
    state === "open"
      ? {
          phaseId: "registration",
          label: tr("Registration phase"),
          detail: edition.registration
            ? tr("Deadline {date}", {
                date: formatDate(
                  edition.registration.closesAt,
                  edition.timeZone,
                  tr.locale,
                ),
              })
            : undefined,
          href: `${base}/register`,
          action: tr("Register individually"),
        }
      : draft && ["live", "paused"].includes(draft.state)
        ? {
            label: tr("Captain draft"),
            href: `${base}/draft`,
            action: tr("Live draft"),
          }
        : fixture
          ? {
              label: fixture.roundName,
              href: `${base}/schedule`,
              action: tr("View schedule"),
            }
          : {
              label: tr(edition.status),
              href: edition.rules ? "#rules" : `${base}/schedule`,
              action: edition.rules
                ? tr("Read the rules")
                : tr("View schedule"),
            };
  return (
    <>
      {unavailable.length > 0 && (
        <p className="notice" role="status">
          {tr(
            "Some competition information is temporarily unavailable. Please try again later.",
          )}
        </p>
      )}
      <InformationDocument
        document={document}
        ruleSections={ruleSections}
        rulesContent={
          <TournamentRules
            edition={edition}
            sections={ruleSections}
            showContents={false}
          />
        }
        active={active}
        stages={tournamentStages(
          [
            ...(edition.registration
              ? [
                  {
                    id: "registration",
                    label: tr("Registration phase"),
                    detail: `${formatDate(edition.registration.opensAt, edition.timeZone, tr.locale)} — ${formatDate(edition.registration.closesAt, edition.timeZone, tr.locale)}`,
                    at: edition.registration.closesAt,
                    href: `${base}/register`,
                    action: tr("View registration"),
                  },
                ]
              : []),
            ...edition.schedule.map((event, index) => ({
              id: `schedule-${index}`,
              label: event.label,
              detail: event.at
                ? formatDate(event.at, edition.timeZone, tr.locale)
                : undefined,
              at: event.at ?? undefined,
              href: `${base}/schedule`,
              action: tr("View schedule"),
            })),
          ],
          active,
        )}
      />
    </>
  );
}

export default function Overview(props: Parameters<typeof OverviewContent>[0]) {
  return remotePage(() => OverviewContent(props));
}
