"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import type { DirectoryPlayer } from "@/lib/player-directory";
import {
  PlayerDirectoryTools,
  usePlayerDirectory,
} from "./player-directory-tools";
import { PlayerCard } from "./player-card";

const PAGE_SIZE = 40;

export type ArchiveDirectoryPlayer = DirectoryPlayer & {
  roleLabel?: string;
  roleCode?: string;
  profileHref: string;
  teamName?: string;
  teamHref?: string;
};

export function ArchivePlayerSearch({
  players,
}: {
  players: ArchiveDirectoryPlayer[];
}) {
  const tr = useAppTranslations();
  const directory = usePlayerDirectory(players);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const filterKey = JSON.stringify(directory.state);
  const [windowFilter, setWindowFilter] = useState(filterKey);
  // Adjust during render, as React recommends for a reset caused by new props.
  if (windowFilter !== filterKey) {
    setWindowFilter(filterKey);
    setLimit(PAGE_SIZE);
  }
  const rows = directory.rows;
  const visible = rows.slice(0, limit);
  return (
    <div className="stack">
      <PlayerDirectoryTools
        directory={directory}
        grouping={directory.options.teams.length > 0}
      />
      <ul className="archive-player-grid">
        {visible.map((player, index) => (
          <Fragment key={player.id}>
            {directory.state.group === "team" &&
              (index === 0 ||
                rows[index - 1].teams[0]?.id !== player.teams[0]?.id) && (
                <li className="directory-team-heading">
                  <h2>{player.teams[0]?.name ?? tr("Players")}</h2>
                </li>
              )}
            <PlayerCard
              osuId={player.id}
              username={player.name}
              profileHref={player.profileHref}
              roleCode={player.roleCode}
              roleLabel={player.roleLabel}
              team={
                player.teamName ? (
                  player.teamHref ? (
                    <Link href={player.teamHref}>{player.teamName}</Link>
                  ) : (
                    player.teamName
                  )
                ) : undefined
              }
            />
          </Fragment>
        ))}
      </ul>
      {rows.length > visible.length && (
        <div className="event-player-more">
          <button
            type="button"
            onClick={() => setLimit((current) => current + PAGE_SIZE)}
          >
            {tr("Show more players")}
          </button>
        </div>
      )}
    </div>
  );
}
