"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type { HistoricalArchive } from "@/lib/historical-archive";
import { ConfirmMutation } from "./confirm-mutation";

export function ArchiveSubstitute({
  archive,
  revision,
}: {
  archive: HistoricalArchive;
  revision: number;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [osuId, setOsuId] = useState("");
  const [username, setUsername] = useState("");
  const [teamId, setTeamId] = useState("");
  const [source, setSource] = useState("");
  const [confirmationSource, setConfirmationSource] = useState("");
  const valid =
    /^\d+$/.test(osuId) &&
    Number(osuId) > 0 &&
    Number(osuId) <= 2147483647 &&
    !!username.trim() &&
    !!teamId &&
    !!source.trim() &&
    !!confirmationSource.trim();
  return (
    <details className="panel form-stack">
      <summary>{tr("Confirm historical substitute")}</summary>
      <p>
        {tr(
          "Record only an organizer-confirmed legal substitute. Draft Tier and replaced player remain unknown; no account or permission is created.",
        )}
      </p>
      <label className="field">
        <span>{tr("Historical username")}</span>
        <input
          maxLength={300}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{tr("osu! ID")}</span>
        <input
          inputMode="numeric"
          value={osuId}
          onChange={(e) => setOsuId(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{tr("Team")}</span>
        <select
          aria-label={tr("Team")}
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="">{tr("Select team")}</option>
          {archive.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{tr("Roster source")}</span>
        <input
          maxLength={160}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{tr("Identity confirmation source")}</span>
        <input
          maxLength={160}
          value={confirmationSource}
          onChange={(e) => setConfirmationSource(e.target.value)}
        />
      </label>
      <ConfirmMutation
        label={tr("Confirm historical substitute")}
        title={tr("Confirm historical substitute")}
        description={tr(
          "Add this confirmed substitute to the historical roster. Published statistics are retained only after every published play is revalidated unchanged. Other games still require review.",
        )}
        url={`/api/admin/tournaments/${archive.editionSlug}`}
        payload={{
          action: "add-archive-substitute",
          osuId: Number(osuId),
          username: username.trim(),
          teamId,
          source: source.trim(),
          confirmationSource: confirmationSource.trim(),
          expectedRevision: revision,
          confirmed: true,
          preserveStatistics: true,
        }}
        canConfirm={valid}
        disabled={!valid}
        onSuccess={() => {
          setOsuId("");
          setUsername("");
          setTeamId("");
          setSource("");
          setConfirmationSource("");
          router.refresh();
        }}
      >
        <p>
          {username} · {osuId} ·{" "}
          {archive.teams.find((t) => t.id === teamId)?.name}
        </p>
        <p>{source}</p>
        <p>{confirmationSource}</p>
      </ConfirmMutation>
    </details>
  );
}
