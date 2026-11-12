"use client";
import { useAppTranslations } from "@/i18n/shared";
import type { EventPlayer } from "@/lib/event-preview";
import type { DirectoryPlayer } from "@/lib/player-directory";
import Link from "./pending-link";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  PlayerDirectoryTools,
  usePlayerDirectory,
} from "./player-directory-tools";
import { Avatar } from "./avatar";
import { PlayerMessageBoard } from "./player-message-board";
import { PlayerReactions } from "./player-reactions";
const PAGE_SIZE = 40;
export function EventPlayers({
  players,
  edition,
  remote = false,
  grouped = false,
  preview = false,
  signedIn = false,
  viewerId,
  otrRatings,
  showImportedRatings = false,
}: {
  remote?: boolean;
  players: (EventPlayer &
    Partial<
      Pick<DirectoryPlayer, "aliases" | "teams" | "roles" | "sip" | "etx">
    > & {
      etxProvisional?: boolean;
      etxOutdated?: boolean;
    })[];
  edition: string;
  grouped?: boolean;
  preview?: boolean;
  signedIn?: boolean;
  viewerId?: number;
  otrRatings?: Promise<Record<number, number>>;
  showImportedRatings?: boolean;
}) {
  const tr = useAppTranslations();
  const [ratingSnapshot, setRatingSnapshot] = useState<{
    source: typeof otrRatings;
    values: Record<number, number>;
  }>();
  const ratingValues =
    ratingSnapshot?.source === otrRatings ? ratingSnapshot?.values : undefined;
  const otrLoading = Boolean(otrRatings && !ratingValues);
  useEffect(() => {
    if (!otrRatings) return;
    let active = true;
    void otrRatings.then(
      (values) => {
        if (active) setRatingSnapshot({ source: otrRatings, values });
      },
      () => {
        if (active) setRatingSnapshot({ source: otrRatings, values: {} });
      },
    );
    return () => {
      active = false;
    };
  }, [otrRatings]);
  const directory = usePlayerDirectory(
    players.map((p) => ({
      ...p,
      otr: ratingValues?.[p.id],
      teams: p.teams ?? (p.team ? [{ id: p.team, name: p.team }] : []),
      roles: p.roles ?? ["player", ...(p.captain ? ["captain"] : [])],
    })),
    grouped,
    otrLoading,
  );
  const { rows } = directory;
  const byTeam = directory.state.group === "team";
  // Keep the first paint bounded for large directories; filters reset the window.
  const pageSize = preview ? Number.MAX_SAFE_INTEGER : PAGE_SIZE;
  const [limit, setLimit] = useState(pageSize);
  const filterKey = JSON.stringify(directory.state);
  const [windowFilter, setWindowFilter] = useState(filterKey);
  // Adjust during render, as React recommends for a reset caused by new props.
  if (windowFilter !== filterKey) {
    setWindowFilter(filterKey);
    setLimit(pageSize);
  }
  const visible = rows.slice(0, limit);
  const hasMore = !preview && rows.length > visible.length;
  const more = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = more.current;
    if (!hasMore || !target || typeof IntersectionObserver === "undefined")
      return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active || !entries.some((entry) => entry.isIntersecting)) return;
        active = false;
        observer.disconnect();
        setLimit((current) =>
          Math.max(current, Math.min(limit + PAGE_SIZE, rows.length)),
        );
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(target);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [filterKey, hasMore, limit, rows.length]);
  return (
    <section className="event-players">
      <PlayerDirectoryTools
        directory={directory}
        grouping={preview || grouped}
      />
      <div className="event-player-group">
        {!byTeam && <h2 className="sr-only">{tr("Players")}</h2>}
        {visible.map((p, index) => (
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
                  <div className="event-player-details">
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
                        prefetch={false}
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
                    {(otrRatings || showImportedRatings) && (
                      <dl className="event-player-ratings">
                        {otrRatings && (
                          <div>
                            <dt>o!TR</dt>
                            <dd>
                              {p.otr?.toLocaleString(tr.locale, {
                                maximumFractionDigits: 2,
                              }) ?? (otrLoading ? "…" : "—")}
                            </dd>
                          </div>
                        )}
                        {showImportedRatings && (
                          <>
                            <div>
                              <dt>{"SIP"}</dt>
                              <dd>
                                {p.sip?.toLocaleString(tr.locale, {
                                  maximumFractionDigits: 2,
                                }) ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt>{"ETX"}</dt>
                              <dd>
                                {p.etx?.toLocaleString(tr.locale, {
                                  maximumFractionDigits: 2,
                                }) ?? "—"}
                                {(p.etxProvisional || p.etxOutdated) && (
                                  <small className="muted">
                                    {[
                                      p.etxProvisional &&
                                        tr("Provisional rating"),
                                      p.etxOutdated && tr("Outdated rating"),
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </small>
                                )}
                              </dd>
                            </div>
                          </>
                        )}
                      </dl>
                    )}
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
                <p tabIndex={0}>{p.bio ?? "—"}</p>
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
      {hasMore && (
        <div className="event-player-more" ref={more}>
          <button
            type="button"
            onClick={() =>
              setLimit((current) => Math.min(current + PAGE_SIZE, rows.length))
            }
          >
            {tr("Show more players")}
          </button>
        </div>
      )}
    </section>
  );
}
