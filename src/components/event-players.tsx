"use client";
import { useAppTranslations } from "@/i18n/shared";
import type { EventPlayer } from "@/lib/event-preview";
import type { DirectoryPlayer } from "@/lib/player-directory";
import Link from "./pending-link";
import { Fragment } from "react";
import {
  PlayerDirectoryTools,
  usePlayerDirectory,
} from "./player-directory-tools";
import { Avatar } from "./avatar";
import { PlayerMessageBoard } from "./player-message-board";
import { PlayerReactions } from "./player-reactions";
export function EventPlayers({
  players,
  edition,
  remote = false,
  grouped = false,
  preview = false,
  signedIn = false,
  viewerId,
}: {
  remote?: boolean;
  players: (EventPlayer &
    Partial<Pick<DirectoryPlayer, "aliases" | "teams" | "roles">>)[];
  edition: string;
  grouped?: boolean;
  preview?: boolean;
  signedIn?: boolean;
  viewerId?: number;
}) {
  const tr = useAppTranslations();
  const directory = usePlayerDirectory(
    players.map((p) => ({
      ...p,
      teams: p.teams ?? (p.team ? [{ id: p.team, name: p.team }] : []),
      roles: p.roles ?? ["player", ...(p.captain ? ["captain"] : [])],
    })),
    grouped,
  );
  const { rows } = directory;
  const byTeam = directory.state.group === "team";
  return (
    <section className="event-players">
      <PlayerDirectoryTools
        directory={directory}
        grouping={preview || grouped}
      />
      <div className="event-player-group">
        {rows.map((p, index) => (
          <Fragment key={p.id}>
            {byTeam &&
              (index === 0 ||
                rows[index - 1].teams[0]?.id !== p.teams[0]?.id) && (
                <h2>{p.teams[0]?.name ?? tr("Players")}</h2>
              )}
            <article className="event-player-row" key={p.id}>
              <div className="event-player-basic">
                <div className="event-player-identity">
                  {preview ? (
                    <div className="event-player-monogram" aria-hidden="true">
                      {p.name.slice(0, 2)}
                    </div>
                  ) : (
                    <Avatar key={p.id} osuId={p.id} username={p.name} />
                  )}
                  <div>
                    <h3>
                      {p.href ? (
                        <a href={`https://osu.ppy.sh/users/${p.id}`}>
                          {p.name}
                        </a>
                      ) : (
                        p.name
                      )}
                    </h3>
                    {byTeam && (p.captain || p.team) && (
                      <span className="muted">
                        {p.captain ? "Captain" : ""}
                        {p.captain && p.team ? " · " : ""}
                        {p.team ?? ""}
                      </span>
                    )}
                    {p.href && (
                      <Link
                        className="text-link small"
                        href={p.href}
                        aria-label={tr("OCLR profile")}
                      >
                        {tr("OCLR profile")} ↗
                      </Link>
                    )}
                    {p.fetchedAt && (
                      <time className="sr-only" dateTime={p.fetchedAt}>
                        {p.fetchedAt}
                      </time>
                    )}
                    <dl>
                      <div>
                        <dt>{tr("Global rank")}</dt>
                        <dd>
                          {p.rank
                            ? `#${p.rank.toLocaleString(tr.locale)}`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>PP</dt>
                        <dd>{p.pp?.toLocaleString(tr.locale) ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                {!remote && (
                  <PlayerReactions
                    edition={edition}
                    playerId={p.id}
                    name={p.name}
                  />
                )}
              </div>
              <div className="event-player-bio">
                <h4>{tr("Self introduction")}</h4>
                <p>{p.bio ?? "—"}</p>
              </div>
              <div className="event-player-messages">
                <h4>{tr("Message board")}</h4>
                {preview ? (
                  <div className="event-message-scroll">
                    {p.messages?.map((m, i) => (
                      <div key={i}>
                        <strong>{m.author}</strong>
                        <p>{m.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <PlayerMessageBoard
                    key={`${edition}:${p.id}`}
                    edition={edition}
                    playerId={p.id}
                    name={p.name}
                    signedIn={signedIn && !remote}
                    viewerId={remote ? undefined : viewerId}
                  />
                )}
              </div>
            </article>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
