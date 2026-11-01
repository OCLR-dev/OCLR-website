import type { ReactNode } from "react";
import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import { Avatar } from "./avatar";
import { PlayerIdBadge } from "./player-id-badge";
import { Badge } from "./ui";

/** Shared roster card; callers supply only identities and roles they may show. */
export function PlayerCard({
  osuId,
  username,
  profileHref,
  roleLabel,
  roleCode,
  team,
  prefetch,
}: {
  osuId: number;
  username: string;
  profileHref: string;
  roleLabel?: string;
  roleCode?: string;
  team?: ReactNode;
  prefetch?: false;
}) {
  const tr = useAppTranslations();
  return (
    <li className="archive-player-card" data-role={roleCode}>
      {/* Keep the osu! profile, copy action and team above the card's OCLR link. */}
      <Link
        className="archive-player-card-link"
        href={profileHref}
        prefetch={prefetch}
        aria-label={`${tr("OCLR profile")}: ${username}`}
      />
      <div className="archive-player-avatar">
        <a
          href={`https://osu.ppy.sh/users/${osuId}/osu`}
          rel="noreferrer"
          tabIndex={-1}
          aria-hidden="true"
        >
          <Avatar osuId={osuId} username={username} />
        </a>
        <PlayerIdBadge
          osuId={osuId}
          palette={null}
          className="archive-player-id"
        />
      </div>
      <div className="archive-player-copy">
        <div className="archive-player-name">
          <a href={`https://osu.ppy.sh/users/${osuId}/osu`} rel="noreferrer">
            {username}
          </a>
          {roleLabel && <Badge>{roleLabel}</Badge>}
        </div>
        {team && <span className="archive-player-team">{team}</span>}
      </div>
    </li>
  );
}
