"use client";
import { useStaffReadOnly } from "./staff-read-only";

import { useAppTranslations } from "@/i18n/shared";

import { useId, useRef, useState } from "react";
import { usePendingRefresh } from "./use-pending-refresh";
import { LoadingRegion } from "./loading-region";
import type { FixtureWorkspace } from "@/lib/fixtures";
import { formatDate } from "@/lib/editions";
export function RefereeAssignment({
  slug,
  fixture,
  data,
}: {
  slug: string;
  fixture: FixtureWorkspace["fixtures"][number];
  data: FixtureWorkspace;
}) {
  const readOnly = useStaffReadOnly() || !data.canManage;
  const tr = useAppTranslations();

  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    { refreshing, refresh } = usePendingRefresh();
  const [selected, setSelected] = useState(fixture.refereeIds);
  const [revision, setRevision] = useState(fixture.assignmentRevision);
  const [query, setQuery] = useState("");
  const [requestPending, setPending] = useState(false),
    [error, setError] = useState("");
  const pending = requestPending || refreshing;
  const [activeAction, setActiveAction] = useState<"save" | "reload">("save");
  function reset() {
    setSelected(fixture.refereeIds);
    setRevision(fixture.assignmentRevision);
    setError("");
  }
  async function reload() {
    if (pending) return;
    setActiveAction("reload");
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/tournaments/${slug}/matches`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Assignments could not be reloaded. Refresh the page to check your access.",
        );
      const workspace: {
        fixtures: Pick<
          FixtureWorkspace["fixtures"][number],
          "id" | "refereeIds" | "assignmentRevision"
        >[];
      } = await response.json();
      const current = workspace.fixtures.find((f) => f.id === fixture.id);
      if (!current) throw new Error("This fixture is no longer available.");
      setSelected(current.refereeIds);
      setRevision(current.assignmentRevision);
      refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Connection interrupted. Try reloading again.",
      );
    } finally {
      setPending(false);
    }
  }
  async function save() {
    if (readOnly || pending) return;
    setActiveAction("save");
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/tournaments/${slug}/matches/${fixture.id}/referees`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedAssignmentRevision: revision,
            refereeIds: selected,
          }),
        },
      );
      if (!response.ok) {
        const result = await response.json();
        setError(result.error ?? "Assignments could not be saved.");
        refresh();
        return;
      }
      dialog.current?.close();
      refresh();
    } catch {
      setError("Connection interrupted. Reload assignments before retrying.");
    } finally {
      setPending(false);
    }
  }
  const names = [
    ...data.eligibleReferees,
    ...fixture.referees.filter(
      (r) => !data.eligibleReferees.some((u) => u.osuId === r.osuId),
    ),
  ];
  const conflicts = fixture.scheduledAt
    ? data.fixtures.filter(
        (f) =>
          f.id !== fixture.id &&
          f.status !== "cancelled" &&
          f.scheduledAt?.getTime() === fixture.scheduledAt?.getTime() &&
          f.refereeIds.some((userId) => selected.includes(userId)),
      )
    : [];
  return (
    <>
      {refreshing && activeAction === "save" && !error && <LoadingRegion />}
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className="secondary"
        onClick={() => {
          reset();
          setQuery("");
          dialog.current?.showModal();
        }}
      >
        {tr("Assign Referee")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        {(requestPending ||
          (refreshing && (activeAction === "reload" || !!error))) && (
          <LoadingRegion />
        )}
        <h2 id={`${id}-title`}>
          {tr("Referees · ")}
          {fixture.label}
        </h2>
        <p className="muted small">
          {fixture.scheduledAt
            ? tr(formatDate(fixture.scheduledAt, fixture.timeZone, tr.locale))
            : tr("Match time TBA")}
        </p>
        <p className="small">
          {tr("Current:")}{" "}
          {fixture.referees.map((r) => r.username).join(", ") ||
            tr("Unassigned")}
        </p>
        <label className="field">
          <span>{tr("Search referees")}</span>
          <input
            type="search"
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
            disabled={pending}
          />
        </label>
        <ul
          className="referee-choices"
          tabIndex={0}
          aria-label={tr("Eligible referee choices")}
        >
          {names
            .filter(
              (u) =>
                u.username.toLowerCase().includes(query.toLowerCase()) ||
                String(u.osuId).includes(query.trim()),
            )
            .map((u) => {
              const eligible = data.eligibleReferees.some(
                (p) => p.osuId === u.osuId,
              );
              return (
                <li key={u.osuId}>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={selected.includes(u.osuId)}
                      disabled={
                        readOnly ||
                        pending ||
                        (!eligible && !selected.includes(u.osuId))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, u.osuId]
                            : selected.filter((n) => n !== u.osuId),
                        )
                      }
                    />
                    <span>
                      {u.username}{" "}
                      <small className="muted">
                        {tr("osu! ID ")}
                        {u.osuId}
                        {!eligible && tr(" · Role no longer active")}
                      </small>
                    </span>
                  </label>
                </li>
              );
            })}
        </ul>
        {!names.length && (
          <p className="muted small">
            {tr(
              "No eligible Referees. Grant an edition-scoped Referee role in Staff Management.",
            )}
          </p>
        )}
        <p className="muted small">
          {selected.length} {tr(" selected")}
        </p>
        {conflicts.length > 0 && (
          <p className="notice small">
            {tr("Also assigned at this exact time:")}{" "}
            {conflicts.map((f) => f.label).join(", ")}
            {tr(". Match duration and availability have not been assumed.")}
          </p>
        )}
        {error && (
          <p className="notice error-text" role="alert">
            {tr(error)}
          </p>
        )}
        <div className="actions">
          <button
            disabled={readOnly || pending}
            aria-busy={pending && activeAction === "save"}
            onClick={save}
          >
            {tr("Save assignments")}
          </button>
          <button
            className="secondary"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            {tr("Cancel")}
          </button>
          {(error || (pending && activeAction === "reload")) && (
            <button
              className="secondary"
              aria-busy={pending && activeAction === "reload"}
              disabled={pending}
              onClick={reload}
            >
              {tr("Reload assignments")}
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
