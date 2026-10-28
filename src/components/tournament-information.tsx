import Link from "next/link";
import { RulesHandbook } from "./rules-handbook";
import { TournamentStageScroll } from "@/components/tournament-stage-scroll";
import type { TournamentStage } from "@/lib/tournament-stages";
import Image from "next/image";
import { getAppTranslations } from "@/i18n/server";
import type { TournamentInformation } from "@/lib/tournament-information";
import type { ReactNode } from "react";
import { RulesSection } from "./rules-section";
import {
  TournamentOverviewContents,
  type OverviewContentsEntry,
} from "./tournament-overview-contents";

export async function InformationDocument({
  document,
  active,
  stages,
  rulesContent,
  ruleSections,
}: {
  rulesContent?: ReactNode;
  ruleSections?: { id: string; heading: string }[];
  stages?: TournamentStage[];
  document: TournamentInformation;
  active: { label: string; detail?: string; href: string; action: string };
}) {
  const tr = await getAppTranslations();
  const previewRules = document.rules.map((rule, index) => ({
    id: `rules-${index + 1}`,
    heading: rule.heading,
    body: rule.paragraphs.join("\n\n"),
  }));
  const hasRules = Boolean(rulesContent) || previewRules.length > 0;
  const contents: OverviewContentsEntry[] = [
    { id: "stages", label: tr("Tournament stages") },
    ...(document.schedule.length > 0
      ? [{ id: "schedule", label: tr("Tournament schedule") }]
      : []),
    ...(document.prizes.length > 0
      ? [{ id: "prizes", label: tr("Prizes") }]
      : []),
    ...(document.teams.length > 0
      ? [{ id: "participants", label: tr("Participants") }]
      : []),
    ...(document.pools.length > 0
      ? [{ id: "mappools", label: tr("Mappools") }]
      : []),
    ...(hasRules
      ? [
          {
            id: "rules",
            label: tr("Tournament rules"),
            chapters: (ruleSections ?? previewRules).map((section) => ({
              id: section.id,
              label: section.heading,
            })),
          },
        ]
      : []),
  ];
  const timeZoneLabel = document.timeZone.includes("UTC")
    ? document.timeZone.slice(document.timeZone.indexOf("UTC"))
    : new Intl.DateTimeFormat("en", {
        timeZone: document.timeZone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")!
        .value.replace("GMT", "UTC");
  return (
    <div className="information-page">
      <h1 className="sr-only" id="information-title">
        {document.name}
      </h1>
      <div className="rules-handbook information-overview-layout">
        <TournamentOverviewContents entries={contents} />
        <div className="information-overview-reading">
          {document.banner && (
            <div
              className={`information-banner${document.banner === "/branding/oclr-s11-winter-banner.svg" ? " information-winter-banner" : ""}`}
            >
              <Image
                src={document.banner}
                alt=""
                width={2560}
                height={1200}
                sizes="(max-width: 900px) 100vw, 1000px"
                unoptimized
              />
              {document.banner !== "/branding/oclr-s11-winter-banner.svg" && (
                <span>{document.name}</span>
              )}
            </div>
          )}
          <TournamentStageScroll
            id="stages"
            stages={stages ?? [{ ...active, id: "active", state: "current" }]}
            labels={{
              title: tr("Tournament stages"),
              previous: tr("Scroll to earlier stages"),
              next: tr("Scroll to later stages"),
              current: tr("Current phase"),
              past: tr("Earlier"),
              upcoming: tr("Upcoming"),
              planned: tr("Planned"),
            }}
          />

          <div className="information-overview-details">
            <article
              className="information-document document-typeset"
              aria-labelledby="information-title"
            >
              {document.schedule.length > 0 && (
                <section id="schedule" tabIndex={-1}>
                  <h2>{tr("Tournament schedule")}</h2>
                  <div className="information-table-scroll" tabIndex={0}>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{tr("Event")}</th>
                          <th scope="col">
                            {tr("Date ({zone})", { zone: timeZoneLabel })}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {document.schedule.map((row, i) => (
                          <tr key={i}>
                            <td>{row.event}</td>
                            <td>{row.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {document.prizes.length > 0 && (
                <section id="prizes" tabIndex={-1}>
                  <h2>{tr("Prizes")}</h2>
                  <div className="information-table-scroll" tabIndex={0}>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{tr("Placing")}</th>
                          <th scope="col">{tr("Prizes")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {document.prizes.map((row, i) => (
                          <tr key={row.placing}>
                            <td>
                              <span
                                className={`information-place place-${i + 1}`}
                                aria-hidden="true"
                              >
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              {row.placing}
                            </td>
                            <td>{row.reward}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {document.teams.length > 0 && (
                <section id="participants" tabIndex={-1}>
                  <h2>{tr("Participants")}</h2>
                  <div className="information-table-scroll" tabIndex={0}>
                    <table className="information-teams">
                      <thead>
                        <tr>
                          <th scope="col">{tr("Team")}</th>
                          <th scope="col">{"Captain"}</th>
                          <th scope="col">{tr("Members")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {document.teams.map((team) => (
                          <tr key={team.name}>
                            <td>
                              {team.href ? (
                                <Link href={team.href}>{team.name}</Link>
                              ) : (
                                team.name
                              )}
                            </td>
                            <td>
                              <strong>{team.captain}</strong>
                            </td>
                            <td>{team.members.join(" / ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {document.pools.length > 0 && (
                <section id="mappools" tabIndex={-1}>
                  <h2>{tr("Mappools")}</h2>
                  {document.pools.map((pool, i) => (
                    <div className="information-pool" key={i}>
                      <h3>{pool.name}</h3>
                      {pool.href && (
                        <p>
                          <Link href={pool.href}>
                            {tr("Explore mappools")} →
                          </Link>
                        </p>
                      )}
                      <ul className="information-pool-groups">
                        {pool.groups.map((group) => (
                          <li key={group.category}>
                            <strong>{group.category}</strong>
                            <ol>
                              {group.maps.map((map, j) => (
                                <li key={j}>
                                  {map.href ? (
                                    <a href={map.href}>{map.title}</a>
                                  ) : (
                                    map.title
                                  )}
                                </li>
                              ))}
                            </ol>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )}
            </article>
          </div>
          {hasRules && (
            <RulesSection titleId="current-rules-title">
              <h2 id="current-rules-title">{tr("Tournament rules")}</h2>
              {rulesContent ?? (
                <RulesHandbook sections={previewRules} showContents={false} />
              )}
            </RulesSection>
          )}
        </div>
      </div>
    </div>
  );
}
