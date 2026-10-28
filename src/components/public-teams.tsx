"use client";

import { TeamAvatar } from "./team-avatar";
import { useAppTranslations } from "@/i18n/shared";

import Link from "./pending-link";
import { useState } from "react";
import type { publishedTeams } from "@/lib/teams";
import type { PublicGroup } from "@/lib/public-competition";
import { GroupStandings } from "./public-matches";
export function PublicTeams({
  teams,
  groups,
  slug,
}: {
  teams: Awaited<ReturnType<typeof publishedTeams>>;
  groups: PublicGroup[];
  slug: string;
}) {
  const tr = useAppTranslations();

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const term = search.trim().toLocaleLowerCase();
  const selected = groups.find((g) => g.key === group);
  const filtered = teams.filter(
    (t) =>
      (!selected || selected.rows.some((r) => r.team.id === t.id)) &&
      (!term ||
        [
          t.name,
          t.captainName,
          t.captainId,
          ...t.coaches.flatMap((c) => [c.username, c.osuId]),
          ...(t.members ?? []).flatMap((m) => [m.username, m.osuId]),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term)),
  );
  return (
    <>
      <div className="team-browse-toolbar">
        {groups.length > 0 && (
          <div
            className="event-pills"
            role="group"
            aria-label={tr("Team groups")}
          >
            {[["", "All teams"], ...groups.map((g) => [g.key, g.name])].map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="secondary"
                  aria-pressed={group === value}
                  onClick={() => setGroup(value)}
                >
                  {value ? label : tr("All teams")}
                </button>
              ),
            )}
          </div>
        )}
        <label className="field">
          <span>{tr("Search teams")}</span>
          <input
            type="search"
            placeholder={tr("Team, captain or published player")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <p className="muted small" role="status">
        {filtered.length} / {teams.length} {tr(" teams")}
      </p>
      <div
        className={`public-team-workspace${groups.length ? " with-standings" : ""}`}
      >
        <div>
          <div className="public-team-grid">
            {filtered.map((t) => {
              const assigned = groups.find((g) =>
                g.rows.some((r) => r.team.id === t.id),
              );
              return (
                <article className="panel public-team-card" key={t.id}>
                  <div className="public-team-heading">
                    <TeamAvatar team={t} />
                    <div>
                      <h2>
                        <Link
                          className="context-link"
                          href={`/tournaments/${slug}/teams/${t.id}`}
                        >
                          {t.name}
                        </Link>
                      </h2>
                      {assigned && (
                        <span className="badge">{assigned.name}</span>
                      )}
                    </div>
                  </div>
                  <p className="muted small">
                    {t.members
                      ? tr("{value0} published roster members", {
                          value0: t.members.length,
                        })
                      : tr("Roster awaiting publication")}
                  </p>
                  <Link
                    className="context-link"
                    href={`/tournaments/${slug}/teams/${t.id}`}
                  >
                    {tr("View team")}
                  </Link>
                </article>
              );
            })}
          </div>
          {!filtered.length && (
            <p className="notice">{tr("No teams match this search.")}</p>
          )}
        </div>
        {groups.length > 0 && (
          <aside className="team-standings">
            <GroupStandings groups={groups} slug={slug} />
          </aside>
        )}
      </div>
    </>
  );
}
