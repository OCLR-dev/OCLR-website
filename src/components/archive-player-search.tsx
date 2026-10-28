"use client";

import { Fragment, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { DirectoryPlayer } from "@/lib/player-directory";
import {
  PlayerDirectoryTools,
  usePlayerDirectory,
} from "./player-directory-tools";

export function ArchivePlayerSearch({
  players,
}: {
  players: (DirectoryPlayer & { card: ReactNode })[];
}) {
  const tr = useAppTranslations();
  const directory = usePlayerDirectory(players);
  const visible = directory.rows;
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
                visible[index - 1].teams[0]?.id !== player.teams[0]?.id) && (
                <li className="directory-team-heading">
                  <h2>{player.teams[0]?.name ?? tr("Players")}</h2>
                </li>
              )}
            {player.card}
          </Fragment>
        ))}
      </ul>
    </div>
  );
}
