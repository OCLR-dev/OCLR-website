"use client";

import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { HistoricalArchive } from "@/lib/historical-archive";
import { Avatar } from "./avatar";
import { ConfirmMutation } from "./confirm-mutation";

type Candidate = { osuId: number; username: string; avatarUrl: string | null };
export function ArchiveStaffResolver({
  archive,
  revision,
}: {
  archive: HistoricalArchive;
  revision: number;
}) {
  const tr = useAppTranslations();
  const unresolved = archive.staff.flatMap((person, index) =>
    person.osuId === null ? [{ ...person, index }] : [],
  );
  const [index, setIndex] = useState(unresolved[0]?.index ?? -1);
  const person = unresolved.find((p) => p.index === index);
  const [username, setUsername] = useState(person?.username ?? "");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function clearCandidate() {
    setCandidate(null);
    setSource("");
    setConfirmed(false);
    setError("");
  }
  async function lookup() {
    if (busy || !person) return;
    clearCandidate();
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/tournaments/${archive.editionSlug}/archive-staff`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffIndex: index,
            username,
            expectedRevision: revision,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(tr(result.error));
        return;
      }
      setCandidate(result);
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  if (!unresolved.length) return null;
  const valid = !!candidate && confirmed && !!source.trim();
  return (
    <section
      className="panel form-stack archive-staff-resolver"
      aria-label={tr("Historical staff identities")}
    >
      <h2>{tr("Historical staff identities")}</h2>
      <fieldset className="form-stack staff-readonly-fields" disabled={busy}>
        <label className="field">
          <span>{tr("Historical staff member")}</span>
          <select
            value={index}
            onChange={(event) => {
              const next = Number(event.target.value);
              setIndex(next);
              setUsername(
                unresolved.find((p) => p.index === next)?.username ?? "",
              );
              clearCandidate();
            }}
          >
            {unresolved.map((p) => (
              <option key={p.index} value={p.index}>
                {p.username} · {p.position}
              </option>
            ))}
          </select>
        </label>
        {person && <p className="muted small">{person.source}</p>}
        <label className="field">
          <span>{tr("Current osu! username")}</span>
          <input
            maxLength={100}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              clearCandidate();
            }}
          />
        </label>
        <div className="actions">
          <button
            type="button"
            disabled={!username.trim()}
            onClick={lookup}
            aria-busy={busy}
          >
            {busy ? tr("Looking up…") : tr("Look up osu! username")}
          </button>
        </div>
      </fieldset>
      {error && (
        <p className="notice error-text" role="alert">
          {error}
        </p>
      )}
      {candidate && (
        <div className="form-stack" key={`${index}:${candidate.osuId}`}>
          <div className="contributor-identity" role="status">
            <Avatar
              osuId={candidate.osuId}
              username={candidate.username}
              avatarUrl={candidate.avatarUrl ?? undefined}
            />
            <a
              href={`https://osu.ppy.sh/users/${candidate.osuId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {candidate.username} · {candidate.osuId}
            </a>
          </div>
          <p className="muted small">
            {tr(
              "A current username match does not prove historical identity. Check independent evidence before linking; keep uncertain names unresolved.",
            )}
          </p>
          <label className="field">
            <span>{tr("Identity confirmation source")}</span>
            <input
              maxLength={160}
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              {tr(
                "I verified this account matches the historical staff member.",
              )}
            </span>
          </label>
          <ConfirmMutation
            label={tr("Link historical staff identity")}
            title={tr("Link historical staff identity")}
            description={tr(
              "Save the confirmed UID while preserving the historical name and role. This does not grant staff access.",
            )}
            url={`/api/admin/tournaments/${archive.editionSlug}`}
            disabled={!valid}
            canConfirm={valid}
            onError={() => {
              setCandidate(null);
              setConfirmed(false);
            }}
            payload={{
              action: "resolve-archive-staff",
              staffIndex: index,
              username: candidate.username,
              osuId: candidate.osuId,
              source: source.trim(),
              identityConfirmed: confirmed,
              expectedRevision: revision,
              confirmed: true,
            }}
          >
            <p>
              {person?.username} → {candidate.username} · {candidate.osuId}
            </p>
            <p>{source}</p>
          </ConfirmMutation>
        </div>
      )}
    </section>
  );
}
