import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppTranslations } from "@/i18n/server";
import type { PublicTournament, PublicPlayer } from "@/lib/read-api-contract";
import { PageHeading, Badge } from "./ui";
import { RulesHandbook } from "./rules-handbook";
import { Avatar } from "./avatar";
import { ArchivePlayerSearch } from "./archive-player-search";
export async function RemoteArchiveCore({
  edition,
  players = [],
  section,
  id,
}: {
  edition: PublicTournament;
  players?: PublicPlayer[];
  section: "overview" | "rules" | "players" | "player";
  id?: string;
}) {
  const tr = await getAppTranslations();
  if (edition.overview.kind !== "historical_archive") notFound();
  const { counts, keyVisual: visual, rulebook } = edition.overview;
  const selected =
    section === "player"
      ? players.filter((p) => String(p.osuId) === id)
      : players;
  if (section === "player" && !selected.length) notFound();
  const base = `/tournaments/${edition.slug}`;
  const card = (p: PublicPlayer) => (
    <li className="archive-player-card" key={p.osuId} data-role={p.role}>
      <Link
        href={`${base}/players/${p.osuId}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Avatar osuId={p.osuId} username={p.username} />
      </Link>
      <div className="archive-player-copy">
        <div className="archive-player-name">
          <Link href={`${base}/players/${p.osuId}`}>{p.username}</Link>{" "}
          <Badge>
            {p.captain
              ? "Captain"
              : p.role === "coach"
                ? tr("Coach")
                : p.role === "free_agent"
                  ? tr("Free agent")
                  : p.tier === null
                    ? tr("Not recorded")
                    : `Tier ${p.tier}`}
          </Badge>
        </div>
        <span className="muted small">
          {tr("osu! ID ")}
          {p.osuId}
        </span>
        {p.team && (
          <span className="archive-player-team">
            <Link href={`${base}/teams/${p.team.id}`}>{p.team.name}</Link>
          </span>
        )}
      </div>
    </li>
  );
  const rules = rulebook ? (
    <>
      <p className="rules-version muted small">
        {rulebook.version && (
          <>
            {tr("Version ")}
            {rulebook.version} ·{" "}
          </>
        )}
        {rulebook.sections.length} {tr("sections")}
      </p>
      <RulesHandbook
        sections={rulebook.sections}
        cover={rulebook.cover}
        archiveSeason={edition.overview.rulebookSeason ?? undefined}
      />
    </>
  ) : (
    <p className="muted">{tr("Not recorded")}</p>
  );
  return (
    <div className="historical-archive stack">
      <PageHeading
        eyebrow={tr("Historical archive")}
        title={
          section === "player"
            ? selected[0].username
            : section === "players"
              ? tr("Players")
              : section === "rules"
                ? tr("Rules")
                : edition.name
        }
      >
        {section === "overview" ? edition.summary : undefined}
      </PageHeading>
      {section === "overview" ? (
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
          <section
            id="rules"
            className="archive-overview-rules"
            aria-labelledby="archive-rules-title"
          >
            <h2 id="archive-rules-title">{tr("Tournament rules")}</h2>
            {rules}
          </section>
        </>
      ) : section === "rules" ? (
        rules
      ) : (
        <>
          {section === "players" ? (
            <ArchivePlayerSearch
              players={selected.map((p) => ({
                id: p.osuId,
                searchText: [p.username, p.osuId, p.team?.name ?? ""].join(" "),
                card: card(p),
              }))}
            />
          ) : (
            <>
              <ul className="archive-player-grid">{selected.map(card)}</ul>
              <a
                href={`https://osu.ppy.sh/users/${selected[0].osuId}`}
                rel="noreferrer"
              >
                {tr("osu! profile")}
              </a>
            </>
          )}
        </>
      )}
    </div>
  );
}
