import { PageNotes } from "./page-notes";
import { MatchDetailsView } from "./match-details";
import {
  publicArchiveStatistics,
  statisticsArchiveKey,
} from "@/lib/archive-statistics";
import { supportsArchiveStatistics } from "@/lib/archive-statistics-model";
import { getAppTranslations } from "@/i18n/server";
import { archivePoolMetadata } from "@/lib/archive-map-metadata";
import { archiveArtworkLookup } from "@/lib/archive-artwork";
import { archiveBracket } from "@/lib/archive-bracket";
import { archiveEventMatches } from "@/lib/archive-event-matches";
import { archiveStaff } from "@/lib/archive-staff";
import { groupArchiveStaff } from "@/lib/archive-staff-groups";
import { remoteMode } from "@/lib/data-source";
import { formatDate, type Edition } from "@/lib/editions";
import {
  archiveWinner,
  recordedArchiveMatch,
  type HistoricalArchive,
} from "@/lib/historical-archive";
import {
  historicalRulebook,
  historicalRulebookSeason,
} from "@/lib/historical-rulebooks";
import { HttpError } from "@/lib/http";
import {
  historicalPlayerModel,
  historicalTournamentOverview,
  publicEditionContext,
} from "@/lib/public-read-models";
import type { PublicPlayer } from "@/lib/read-api-contract";
import { publicDirectoryPlayer } from "@/lib/player-directory";
import { deriveS8Standings } from "@/lib/s8-standings";
import { hasS1FinalStandings } from "@/lib/s1-archive";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArchiveCompetition } from "./archive-competition";
import { ArchiveMappools } from "./archive-mappools";
import { ArchivePlayerSearch } from "./archive-player-search";
import { ArchiveRosterSources } from "./archive-source-records";
import { Avatar } from "./avatar";
import { EventSchedule } from "./event-schedule";
import { RulesHandbook } from "./rules-handbook";
import { RulesSection } from "./rules-section";
import { Badge, PageHeading } from "./ui";

export type ArchiveSection =
  | "overview"
  | "teams"
  | "team"
  | "players"
  | "player"
  | "schedule"
  | "results"
  | "match"
  | "mappools"
  | "pool"
  | "bracket"
  | "draft"
  | "staff"
  | "rules"
  | "awards";
export async function historicalPage(
  slug: string,
  section: Exclude<ArchiveSection, "rules">,
  id?: string,
  statusFilter?: "all" | "recorded" | "unconfirmed",
) {
  let edition: Edition;
  try {
    edition = remoteMode()
      ? (await (await import("@/lib/content")).getPublicEdition(slug))!
      : (await publicEditionContext(slug)).edition;
    if (!edition) notFound();
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  if (edition.archive && section === "results")
    redirect(`/tournaments/${slug}/schedule?status=recorded`);
  return edition.archive ? (
    <HistoricalArchiveView
      edition={edition}
      archive={edition.archive}
      section={section}
      id={id}
      statusFilter={statusFilter}
    />
  ) : null;
}

/** Shared by private preview and published, edition-scoped historical pages. */
export async function HistoricalArchiveView({
  edition,
  archive: a,
  section = "overview",
  id,
  preview = false,
  statusFilter = "all",
}: {
  edition: Edition;
  archive: HistoricalArchive;
  section?: ArchiveSection;
  id?: string;
  preview?: boolean;
  statusFilter?: "all" | "recorded" | "unconfirmed";
}) {
  const tr = await getAppTranslations();
  const base = preview
    ? `/admin/tournaments/${edition.slug}/archive/preview`
    : `/tournaments/${edition.slug}`;
  const href = (section: string, id?: string) =>
    preview
      ? `${base}?section=${section}${id ? `&id=${encodeURIComponent(id)}` : ""}`
      : `${base}/${section}${id ? `/${id}` : ""}`;
  const team = (id: string) => a.teams.find((t) => t.id === id)!;
  const player = (id: number) => a.players.find((p) => p.osuId === id)!;
  const teamLink = (id: string) => (
    <Link href={href("teams", id)}>{team(id).name}</Link>
  );
  const playerLink = (p: Pick<PublicPlayer, "osuId" | "username">) => (
    <Link href={href("players", String(p.osuId))}>{p.username}</Link>
  );
  const role = (
    p: Pick<
      HistoricalArchive["players"][number],
      "role" | "tier" | "sourceRole"
    >,
  ) =>
    p.sourceRole === "VICE"
      ? "VICE"
      : p.role === "captain"
        ? "Captain"
        : p.role === "coach"
          ? tr("Coach")
          : p.role === "free_agent"
            ? tr("Free agent")
            : p.tier === null
              ? tr("Not recorded")
              : `Tier ${p.tier}`;
  const rosterCard = (
    p: HistoricalArchive["players"][number] | PublicPlayer,
    showTeam = true,
  ) => (
    <li className="archive-player-card" key={p.osuId} data-role={p.role}>
      <Link
        href={href("players", String(p.osuId))}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Avatar osuId={p.osuId} username={p.username} />
      </Link>
      <div className="archive-player-copy">
        <div className="archive-player-name">
          {playerLink(p)}{" "}
          <Badge>
            {role({
              ...p,
              sourceRole: a.players.find((s) => s.osuId === p.osuId)
                ?.sourceRole,
            })}
          </Badge>
        </div>
        <span className="muted small">
          {tr("osu! ID ")}
          {p.osuId}
        </span>
        {showTeam && ("teamId" in p ? p.teamId : p.team?.id) && (
          <span className="archive-player-team">
            {teamLink(("teamId" in p ? p.teamId : p.team?.id)!)}
          </span>
        )}
      </div>
    </li>
  );
  const roster = (
    members: (HistoricalArchive["players"][number] | PublicPlayer)[],
    showTeam = true,
  ) => (
    <ul className="archive-player-grid">
      {members.map((p) => rosterCard(p, showTeam))}
    </ul>
  );
  const match = (m: HistoricalArchive["matches"][number]) => (
    <article
      className="archive-match"
      key={m.id}
      data-recorded={recordedArchiveMatch(m)}
      data-forfeit={m.forfeitWinner !== undefined || undefined}
    >
      <header className="archive-match-meta">
        <Link className="text-link" href={href("matches", m.id)}>
          {m.label}
        </Link>
        <span>{m.stage}</span>
        <span className="muted small">
          {m.scheduledAt
            ? formatDate(m.scheduledAt, edition.timeZone, tr.locale)
            : tr("Not recorded")}
        </span>
      </header>
      {(m.roomOpenedAt ?? m.review?.startedAt) && (
        <p className="muted small">
          {tr("MP room opened")} ·{" "}
          {formatDate(
            (m.roomOpenedAt ?? m.review?.startedAt)!,
            edition.timeZone,
            tr.locale,
          )}
        </p>
      )}
      <div className="archive-scoreboard">
        {[m.teamA, m.teamB].map((teamId, i) => {
          const won = archiveWinner(m) === i;
          return (
            <div
              className="archive-score-team"
              key={teamId}
              data-winner={won || undefined}
            >
              <span>
                {teamLink(teamId)}
                {won && <span className="sr-only">{tr(" (winner)")}</span>}
              </span>
              <strong>
                {m.forfeitWinner !== undefined
                  ? won
                    ? tr("Winner")
                    : tr("Forfeit")
                  : ((preview && m.review?.status === "pending"
                      ? m.review.workingScore
                      : m.score)?.[i] ?? "—")}
              </strong>
            </div>
          );
        })}
      </div>
      <footer className="archive-match-footer">
        <span className="small muted">
          {recordedArchiveMatch(m)
            ? tr("Recorded results")
            : tr("Unconfirmed records")}
        </span>
        <div className="archive-match-links">
          {m.mpUrls.map((url, i) => (
            <a className="text-link" key={url} href={url} rel="noreferrer">
              MP {i + 1}
            </a>
          ))}
          {m.vodUrl && (
            <a className="text-link" href={m.vodUrl} rel="noreferrer">
              {tr("Watch replay")}
            </a>
          )}
        </div>
      </footer>
      {!recordedArchiveMatch(m) && (
        <p className="muted small archive-unconfirmed">
          {m.review
            ? `${tr("Unconfirmed records")} · ${m.review.workingScore?.join(" : ") ?? "—"}`
            : tr(
                "Schedule record only; completion and result are not confirmed.",
              )}
        </p>
      )}
      {section === "match" && (
        <>
          <dl className="detail-list">
            {[
              [tr("Referee"), m.referee],
              [tr("Streamer"), m.streamer],
              [tr("Commentators"), m.commentators],
              [tr("Red bans"), m.bansA],
              [tr("Blue bans"), m.bansB],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? tr("Not recorded")}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </article>
  );
  function rulesContent() {
    const rules = historicalRulebook(a, edition.rules);
    if (!rules && a.sourceFacts?.some((f) => f.category === "rules")) {
      notes = a.sourceFacts
        .filter((f) => f.category === "rules")
        .map((f, i) => (
          <p key={i}>
            {f.label} · {f.source}
          </p>
        ));
      return (
        <div className="stack">
          {a.sourceFacts
            .filter((f) => f.category === "rules")
            .map((f, i) => (
              <section key={i}>
                <h3>{f.label}</h3>
                <p>{f.text}</p>
              </section>
            ))}
        </div>
      );
    }
    return rules ? (
      <>
        <p className="rules-version muted small">
          {rules.version ? (
            <>
              {tr("Version ")}
              {rules.version} ·{" "}
            </>
          ) : null}
          {rules.sections.length} {tr("sections")}
        </p>
        <RulesHandbook
          sections={rules.sections}
          cover={rules.cover}
          archiveSeason={historicalRulebookSeason(rules)}
        />
      </>
    ) : (
      <p className="muted">{tr("Not recorded")}</p>
    );
  }
  function competition() {
    const bracket = archiveBracket(a, (id) => href("matches", id));
    const rules = historicalRulebook(a, edition.rules);
    const derived =
      rules && historicalRulebookSeason(rules) === "8"
        ? deriveS8Standings(a)
        : null;
    const standings =
      derived ??
      [...a.standings].sort(
        (x, y) =>
          x.group.localeCompare(y.group) ||
          (x.rank ?? Infinity) - (y.rank ?? Infinity),
      );
    if (bracket)
      for (const group of bracket.groups) {
        if (group.id === "match-path") group.label = tr("Match path");
        for (const round of group.rounds)
          for (const match of round.matches)
            if (
              a.matches.find((m) => m.id === match.id)?.forfeitWinner !==
              undefined
            )
              match.note = tr("Forfeit");
      }
    notes = [
      derived && (
        <p key="standings">
          {tr(
            "Calculated from recorded group results: wins, then map difference. This is a derived order, not an official archived ranking. Equal values share a rank; incomplete or ambiguous groups await review.",
          )}
        </p>
      ),
      bracket?.groups.some((g) => g.layout !== "grid") && (
        <p key="appearances">
          {tr(
            "Recorded appearances are reference links, not confirmed advancement.",
          )}
        </p>
      ),
    ];
    const finalRanks = hasS1FinalStandings(a);
    const standingsContent = standings.length ? (
      <>
        <h2>{finalRanks ? tr("Final standings") : tr("Group standings")}</h2>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={title}
        >
          <table>
            <thead>
              <tr>
                {[
                  ...(finalRanks ? [] : [tr("Group")]),
                  tr("Rank"),
                  tr("Team"),
                  ...(derived ? [tr("Played")] : []),
                  tr("Wins"),
                  tr("Losses"),
                  tr("Maps won"),
                  tr("Maps lost"),
                  ...(derived ? [tr("Map difference")] : []),
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.teamId}>
                  {!finalRanks && <td>{s.group}</td>}
                  <td>
                    {s.rank ??
                      ("status" in s
                        ? s.status === "review"
                          ? tr("Awaiting review")
                          : tr("Incomplete results")
                        : tr("Not recorded"))}
                    {"tied" in s && s.tied ? ` · ${tr("Tied")}` : ""}
                  </td>
                  <td>{teamLink(s.teamId)}</td>
                  {"played" in s && <td>{s.played}</td>}
                  <td>{s.wins}</td>
                  <td>{s.losses}</td>
                  <td>{s.mapsWon}</td>
                  <td>{s.mapsLost}</td>
                  {"mapDifference" in s && <td>{s.mapDifference}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ) : undefined;
    return (
      <ArchiveCompetition
        bracket={bracket}
        teamUrls={Object.fromEntries(
          a.teams.map((t) => [t.id, href("teams", t.id)]),
        )}
        standings={finalRanks ? undefined : standingsContent}
        finalStandings={finalRanks ? standingsContent : undefined}
      />
    );
  }
  let notes: React.ReactNode;
  let content;
  let title = edition.name;
  if (section === "overview") {
    const { counts, keyVisual: visual } = historicalTournamentOverview(
      edition,
      a,
    );
    content = (
      <>
        <div
          className={`archive-overview-summary${visual ? " has-visual" : ""}`}
        >
          {visual && (
            <div className="archive-key-visual">
              <Image
                src={visual.src}
                alt={tr("{value0} key visual", { value0: edition.name })}
                width={visual.width}
                height={visual.height}
                unoptimized
              />
            </div>
          )}
          <dl className="archive-counts">
            {[
              [tr("Teams"), counts.teams],
              [tr("Players & coaches"), counts.players],
              [tr("Recorded results"), counts.results],
              [tr("Mappools"), counts.pools],
              [tr("Maps"), counts.maps],
            ].map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
        </div>
        <RulesSection titleId="archive-rules-title">
          <h2 id="archive-rules-title">{tr("Tournament rules")}</h2>
          {rulesContent()}
        </RulesSection>
        {preview && (
          <nav className="actions" aria-label={tr("Archive sections")}>
            {[
              ["teams", tr("Teams")],
              ["players", tr("Players")],
              ["schedule", tr("Schedule")],
              ["mappools", tr("Mappools")],
              ["draft", tr("Draft results")],
              ["staff", tr("Staff")],
            ].map(([path, label]) => (
              <Link key={path} href={href(path)}>
                {label}
              </Link>
            ))}
          </nav>
        )}
      </>
    );
  } else if (section === "staff") {
    title = tr("Staff");
    const groups = groupArchiveStaff(archiveStaff(a));
    const roleTitles: Record<string, string> = {
      referee: tr("Referee"),
      streamer: tr("Streamer"),
      commentator: tr("Commentator"),
      unspecified: tr("Staff (unspecified)"),
    };
    content = groups.length ? (
      <div className="archive-staff stack">
        {groups.map(({ key, members }) => (
          <section key={key}>
            <h2>{Object.hasOwn(roleTitles, key) ? roleTitles[key] : key}</h2>
            <ul className="public-staff-list">
              {members.map((person, index) => (
                <li key={`${person.osuId}-${index}`}>
                  {person.osuId ? (
                    <Avatar osuId={person.osuId} username={person.names[0]} />
                  ) : (
                    <div className="avatar" aria-hidden="true">
                      <span>{person.names[0].slice(0, 2)}</span>
                    </div>
                  )}
                  <div>
                    <h3>
                      {person.osuId ? (
                        <a
                          className="context-link"
                          href={`https://osu.ppy.sh/users/${person.osuId}`}
                          rel="noreferrer"
                        >
                          {person.names.join(" · ")}
                        </a>
                      ) : (
                        person.names.join(" · ")
                      )}
                    </h3>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    ) : (
      <p className="muted">{tr("Not recorded")}</p>
    );
  } else if (section === "teams" || section === "team") {
    const teams =
      section === "team" ? a.teams.filter((t) => t.id === id) : a.teams;
    if (!teams.length) notFound();
    title = section === "team" ? teams[0].name : tr("Teams");
    content = (
      <div className="stack">
        {teams.map((t) => (
          <section className="archive-team-section" key={t.id}>
            {section === "teams" && <h2>{teamLink(t.id)}</h2>}
            {roster(
              a.players.filter((p) => p.teamId === t.id),
              false,
            )}
            <ArchiveRosterSources
              archive={a}
              teamId={t.id}
              showSources={false}
            />
          </section>
        ))}
      </div>
    );
  } else if (section === "players" || section === "player") {
    const allPlayers = historicalPlayerModel(edition, a, {
      kind: "historical_archive",
      revision: null,
      updatedAt: null,
      capturedOn: a.capturedOn,
    });
    const players =
      section === "player"
        ? allPlayers.filter((p) => String(p.osuId) === id)
        : allPlayers;
    if (!players.length && section === "player") notFound();
    const aliases = preview
      ? []
      : remoteMode()
        ? (
            await (
              await import("@/lib/frontend-data")
            ).frontendPlayers(edition.slug)
          ).rows.flatMap((p) =>
            (p.previousUsernames ?? []).map((username) => ({
              osuId: p.osuId,
              username,
            })),
          )
        : await (
            await import("@/lib/player-identity")
          ).visiblePlayerNames(players.map((p) => p.osuId));
    title = section === "player" ? players[0].username : tr("Players");
    content = (
      <>
        {section === "players" ? (
          <ArchivePlayerSearch
            players={players.map((p) => ({
              ...publicDirectoryPlayer(
                p,
                aliases
                  .filter((n) => n.osuId === p.osuId)
                  .map((n) => n.username),
              ),
              card: rosterCard(p),
            }))}
          />
        ) : (
          roster(players)
        )}
        {section === "player" && (
          <>
            <Link
              className="context-link"
              href={`/players/${players[0].osuId}?edition=${edition.slug}`}
            >
              {tr("OCLR profile")} →
            </Link>
            {" · "}
            <a
              href={`https://osu.ppy.sh/users/${players[0].osuId}`}
              rel="noreferrer"
            >
              {tr("osu! profile")}
            </a>
          </>
        )}
        {section === "players" && (
          <ArchiveRosterSources archive={a} showSources={false} />
        )}
      </>
    );
  } else if (["schedule", "results", "match"].includes(section)) {
    const matches = a.matches
      .filter((m) => preview || recordedArchiveMatch(m))
      .filter((m) =>
        section === "match"
          ? m.id === id
          : section !== "results" || recordedArchiveMatch(m),
      )
      .sort((x, y) => {
        const at = (m: typeof x) =>
          m.roomOpenedAt ?? m.review?.startedAt ?? m.scheduledAt;
        return (
          (at(x) ? Date.parse(at(x)!) : Infinity) -
            (at(y) ? Date.parse(at(y)!) : Infinity) || x.id.localeCompare(y.id)
        );
      });
    if (section === "match" && !matches.length) notFound();
    title = section === "match" ? matches[0].label : tr("Matches & results");
    const statistics =
      section === "match" &&
      !preview &&
      supportsArchiveStatistics(edition.slug) &&
      (process.env.DATABASE_URL || remoteMode())
        ? await publicArchiveStatistics(edition.slug, id)
        : null;
    const details =
      statistics?.archiveKey === statisticsArchiveKey(a)
        ? (statistics.matchDetails.find((m) => m.fixtureId === id)?.details ??
          null)
        : null;
    content =
      section === "match" ? (
        <>
          {match(matches[0])}
          {!preview && (
            <MatchDetailsView
              details={details}
              slug={edition.slug}
              teams={a.teams}
              timeZone={edition.timeZone}
              historical
            />
          )}
        </>
      ) : (
        <EventSchedule
          key={statusFilter}
          edition={edition.slug}
          heading={false}
          reviewMode={preview}
          initialStatus={statusFilter}
          timeZone={edition.timeZone}
          competition={competition()}
          phases={[...new Set(matches.map((m) => m.stage))].map((stage) => ({
            id: stage,
            label: stage,
          }))}
          matches={archiveEventMatches(
            a,
            matches,
            href,
            edition.timeZone,
            tr.locale,
          )}
        />
      );
  } else if (section === "mappools" || section === "pool") {
    const pool =
      section === "pool" ? a.pools.find((p) => p.id === id) : a.pools[0];
    if (section === "pool" && !pool) notFound();
    const display = pool ? archivePoolMetadata(pool, a.editionSlug) : null;
    const artwork =
      pool && display
        ? await archiveArtworkLookup(
            pool.maps
              .flatMap((m) => [m.beatmapId, m.originalId ?? null])
              .filter((id) => id !== null && !display.setIds[id]),
          )
        : null;
    title = tr("Mappools");
    content =
      pool && display ? (
        <ArchiveMappools
          key={pool.id}
          pool={display.pool}
          artworkSetIds={{ ...artwork?.setIds, ...display.setIds }}
          missingBeatmapIds={artwork?.missingBeatmapIds}
          stages={a.pools.map((p) => ({
            id: p.id,
            name: p.name,
            count: p.maps.length,
            href: href("mappools", p.id),
          }))}
        />
      ) : (
        <p className="notice">{tr("No mappools recorded.")}</p>
      );
  } else if (section === "bracket") {
    title = tr("Bracket");
    content = competition();
  } else if (section === "draft") {
    title = tr("Draft results");
    if (a.draftMode === "final-tiers")
      notes = (
        <p>{tr("Final Tier allocations; selection order was not recorded.")}</p>
      );
    content =
      a.draftMode === "final-tiers" ? (
        <div className="archive-draft">
          {[
            ...new Set(
              a.players
                .filter((p) => p.role === "player" && p.tier !== null)
                .map((p) => p.tier!),
            ),
          ]
            .sort((x, y) => x - y)
            .map((tier) => (
              <section key={tier} className="archive-draft-round">
                <h2>{`Tier ${tier}`}</h2>
                {roster(
                  a.players.filter(
                    (p) => p.role === "player" && p.tier === tier,
                  ),
                )}
              </section>
            ))}
        </div>
      ) : (
        <div className="archive-draft">
          {[...new Set(a.picks.map((p) => p.round))]
            .sort((a, b) => a - b)
            .map((round) => (
              <section className="archive-draft-round" key={round}>
                <header>
                  <h2>{tr("Round {round}", { round })}</h2>
                  <span className="muted small">{`Tier ${round}`}</span>
                </header>
                <ol className="archive-draft-picks">
                  {a.picks
                    .filter((p) => p.round === round)
                    .sort((a, b) => a.pick - b.pick)
                    .map((pick) => {
                      const p = player(pick.osuId);
                      return (
                        <li key={p.osuId} value={pick.pick}>
                          <span
                            className="archive-pick-number"
                            aria-label={tr("Pick {pick}", { pick: pick.pick })}
                          >
                            {String(pick.pick).padStart(2, "0")}
                          </span>
                          <Avatar osuId={p.osuId} username={p.username} />
                          <div>
                            <strong>{playerLink(p)}</strong>
                            <span className="small muted">
                              {teamLink(pick.teamId)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                </ol>
              </section>
            ))}
        </div>
      );
  } else if (section === "rules") {
    title = tr("Rules");
    content = rulesContent();
  } else {
    title = tr("Historical statistics");
    content = <p className="muted">{tr("Not recorded")}</p>;
  }
  return (
    <div
      className={`historical-archive stack${section === "mappools" || section === "pool" ? " archive-pool-page" : ""}`}
    >
      <PageHeading eyebrow={tr("Historical archive")} title={title}>
        {section === "overview" ? edition.summary : undefined}
      </PageHeading>
      {preview && <p className="notice">{tr("Private archive preview")}</p>}
      {section !== "overview" && preview && (
        <Link className="text-link" href={base}>
          {tr("Archive overview")}
        </Link>
      )}
      {content}
      <PageNotes>{notes}</PageNotes>
    </div>
  );
}
