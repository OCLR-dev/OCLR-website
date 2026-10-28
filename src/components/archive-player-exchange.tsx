"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type { HistoricalArchive } from "@/lib/historical-archive";
import { ConfirmMutation } from "./confirm-mutation";

export function ArchivePlayerExchange({
  archive,
  revision,
}: {
  archive: HistoricalArchive;
  revision: number;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [source, setSource] = useState("");
  const players = archive.players.filter((p) => p.role === "player");
  const first = players.find((p) => String(p.osuId) === firstId);
  const second = players.find((p) => String(p.osuId) === secondId);
  const teamName = (teamId: string | null | undefined) =>
    archive.teams.find((t) => t.id === teamId)?.name ?? "";
  const valid =
    !!first && !!second && first.teamId !== second.teamId && !!source.trim();
  return (
    <details className="panel form-stack">
      <summary>{tr("Exchange historical players")}</summary>
      <p>
        {tr(
          "Exchange only organizer-confirmed players from different teams. Original roles, Tiers and roster sources are retained; the exchange date remains unknown.",
        )}
      </p>
      <label className="field">
        <span>{tr("First player")}</span>
        <select
          aria-label={tr("First player")}
          value={firstId}
          onChange={(e) => {
            setFirstId(e.target.value);
            setSecondId("");
          }}
        >
          <option value="">{tr("Select player")}</option>
          {players.map((p) => (
            <option key={p.osuId} value={p.osuId}>
              {p.username} · {p.osuId} · {teamName(p.teamId)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{tr("Second player")}</span>
        <select
          aria-label={tr("Second player")}
          value={secondId}
          disabled={!first}
          onChange={(e) => setSecondId(e.target.value)}
        >
          <option value="">{tr("Select player")}</option>
          {players
            .filter((p) => first && p.teamId !== first.teamId)
            .map((p) => (
              <option key={p.osuId} value={p.osuId}>
                {p.username} · {p.osuId} · {teamName(p.teamId)}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        <span>{tr("Identity confirmation source")}</span>
        <input
          maxLength={160}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </label>
      <ConfirmMutation
        label={tr("Exchange historical players")}
        title={tr("Exchange historical players")}
        description={tr(
          "Save this confirmed exchange. Published statistics are retained only when every published play is revalidated unchanged. Other games still require review.",
        )}
        url={`/api/admin/tournaments/${archive.editionSlug}`}
        payload={{
          action: "exchange-archive-players",
          firstOsuId: Number(firstId),
          firstTeamId: first?.teamId ?? "",
          secondOsuId: Number(secondId),
          secondTeamId: second?.teamId ?? "",
          confirmationSource: source.trim(),
          expectedRevision: revision,
          confirmed: true,
          preserveStatistics: true,
        }}
        canConfirm={valid}
        disabled={!valid}
        onSuccess={() => {
          setFirstId("");
          setSecondId("");
          setSource("");
          router.refresh();
        }}
      >
        <p>
          {first?.username} · {first?.osuId}: {teamName(first?.teamId)} →{" "}
          {teamName(second?.teamId)}
        </p>
        <p>
          {second?.username} · {second?.osuId}: {teamName(second?.teamId)} →{" "}
          {teamName(first?.teamId)}
        </p>
        <p>{source}</p>
      </ConfirmMutation>
    </details>
  );
}
