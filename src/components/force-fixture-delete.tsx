"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import {
  forceDeleteBlockerMessage,
  type FixtureForceDeletePreview,
} from "@/lib/fixture-force-delete-model";
import { useStaffReadOnly } from "./staff-read-only";

export function ForceFixtureDelete({
  slug,
  fixtureId,
  onDeleted,
}: {
  slug: string;
  fixtureId: string;
  onDeleted: () => void;
}) {
  const tr = useAppTranslations(),
    router = useRouter(),
    id = useId();
  const readOnly = useStaffReadOnly();
  const dialog = useRef<HTMLDialogElement>(null),
    generation = useRef(0);
  const [preview, setPreview] = useState<FixtureForceDeletePreview | null>(
    null,
  );
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const endpoint = `/api/admin/tournaments/${slug}/matches`;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (readOnly) dialog.current?.close();
  }, [readOnly]);
  async function load() {
    if (readOnly) return;
    const current = ++generation.current;
    setLoading(true);
    setError("");
    setPreview(null);
    setLabel("");
    setConfirmed(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_force_delete", fixtureId }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (current === generation.current)
          setError(body.error ?? "The action could not be completed.");
        return;
      }
      if (current === generation.current) setPreview(body);
    } catch {
      if (current === generation.current)
        setError("The action could not be completed.");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  function close() {
    if (busy) return;
    generation.current++;
    setLoading(false);
    dialog.current?.close();
  }
  const canConfirm =
    !readOnly &&
    !busy &&
    !loading &&
    preview &&
    !preview.blocker &&
    confirmed &&
    label === preview.label;
  async function remove() {
    if (!canConfirm || !preview) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "force_delete",
          fixtureId,
          expectedVersion: preview.version,
          expectedAssignmentRevision: preview.assignmentRevision,
          expectedDeletionFingerprint: preview.fingerprint,
          confirmationLabel: label,
          testFixtureConfirmed: confirmed,
          confirmed: true,
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        if (response.status === 409) {
          setPreview(null);
          setLabel("");
          setConfirmed(false);
        }
        setError(body.error ?? "The action could not be completed.");
        return;
      }
      dialog.current?.close();
      onDeleted();
      router.refresh();
    } catch {
      setError(
        tr(
          "Connection interrupted. Refresh to check the saved state before retrying.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="secondary destructive-action"
        disabled={readOnly || busy}
        onClick={() => {
          dialog.current?.showModal();
          void load();
        }}
      >
        {tr("Force delete test fixture")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else {
            generation.current++;
            setLoading(false);
          }
        }}
      >
        <h2 id={`${id}-title`}>{tr("Force delete test fixture")}</h2>
        <p id={`${id}-description`} className="muted">
          {tr(
            "Remove this test fixture and its unapproved records. Approved results and bracket references remain protected. This cannot be undone from the interface; deletion evidence is retained in the audit log.",
          )}
        </p>
        {loading && <p role="status">{tr("Loading deletion preview…")}</p>}
        {preview && (
          <>
            <h3>{preview.label}</h3>
            <dl className="detail-list">
              {[
                [
                  tr("Referee session / events"),
                  `${preview.counts.refereeSessions} / ${preview.counts.refereeEvents}`,
                ],
                [
                  tr("MP imports / games"),
                  `${preview.counts.imports} / ${preview.counts.games}`,
                ],
                [
                  tr("Unapproved results / revisions"),
                  `${preview.counts.results} / ${preview.counts.resultRevisions}`,
                ],
                [tr("Reconciliation records"), preview.counts.reconciliations],
                [
                  tr("IRC bindings / commands"),
                  `${preview.counts.connections} / ${preview.counts.commands}`,
                ],
                [
                  tr("Referee / streaming / commentary assignments"),
                  `${preview.counts.referees} / ${preview.counts.streams} / ${preview.counts.commentators}`,
                ],
                [tr("Statistics drafts"), preview.counts.statistics],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {preview.blocker ? (
              <p role="alert" className="notice error-text">
                {forceDeleteBlockerMessage(tr, preview.blocker)}
              </p>
            ) : (
              <fieldset
                disabled={busy || readOnly}
                className="form-stack staff-readonly-fields"
              >
                <p className="muted small">
                  {tr(
                    "Website IRC bindings and pending commands will be removed. Commands already sent to IRC cannot be recalled.",
                  )}
                </p>
                <label className="field">
                  <span>{tr("Type the fixture label to confirm")}</span>
                  <input
                    value={label}
                    maxLength={100}
                    autoComplete="off"
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />{" "}
                  {tr(
                    "I confirm this is test data and agree to remove its unapproved records.",
                  )}
                </label>
              </fieldset>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="notice error-text">
            {tr(error)}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="destructive-action"
            disabled={!canConfirm}
            onClick={() => void remove()}
          >
            {busy ? tr("Deleting…") : tr("Confirm force deletion")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading || readOnly}
            onClick={() => void load()}
          >
            {tr("Reload deletion preview")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            {tr("Cancel")}
          </button>
        </div>
      </dialog>
    </>
  );
}
