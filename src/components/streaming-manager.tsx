"use client";

import styles from "./streaming-manager.module.css";

import Link from "next/link";
import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { StreamingWorkspace } from "@/lib/streaming";
import { formatDate } from "@/lib/editions";
import { ConfirmMutation } from "./confirm-mutation";
type Fixture = StreamingWorkspace["fixtures"][number];
function StreamingMutation(
  props: React.ComponentProps<typeof ConfirmMutation>,
) {
  // Retain the key across network retries, and remount when the reviewed command changes.
  const [requestKey] = useState(() => crypto.randomUUID());
  return (
    <ConfirmMutation {...props} payload={{ ...props.payload, requestKey }} />
  );
}
function StreamingTask({
  slug,
  fixture: f,
  data,
}: {
  slug: string;
  fixture: Fixture;
  data: StreamingWorkspace;
}) {
  const tr = useAppTranslations();
  const [target, setTarget] = useState(String(f.assignment?.userId ?? ""));
  const available =
    data.operational && f.status === "scheduled" && !f.completed;
  const own = f.assignment?.userId === data.actorId;
  const selectedId = data.canManage ? Number(target) : data.actorId;
  const conflicts = f.sameStartBookings.filter((b) => b.userId === selectedId);
  function action(action: string, label: string, userId?: number) {
    return (
      <StreamingMutation
        key={`${action}:${userId ?? ""}:${f.streamRevision}:${f.version}`}
        label={label}
        title={tr("Confirm streaming task change?")}
        url={`/api/admin/tournaments/${slug}/streaming/${f.id}`}
        payload={{
          action,
          ...(userId ? { userId } : {}),
          expectedRevision: f.streamRevision,
          expectedFixtureVersion: f.version,
          confirmed: true,
        }}
        disabled={action === "assign" && !userId}
      />
    );
  }
  const slot = (value: Fixture["home"]) =>
    value.name ??
    (value.source
      ? value.outcome === "loser"
        ? tr("Loser of {value0}", { value0: value.source })
        : tr("Winner of {value0}", { value0: value.source })
      : tr("Team TBD"));
  return (
    <article className={`panel ${styles.task}`} aria-label={f.label}>
      <div className={styles.match}>
        <div className={styles.matchHeading}>
          <p className="small muted">{f.roundName}</p>
          <h2>
            <Link
              className="text-link"
              href={`/admin/tournaments/${slug}/matches/${f.id}`}
            >
              {f.label}
            </Link>
          </h2>
        </div>
        <p className={`streaming-pairing ${styles.pairing}`}>
          {slot(f.home)} {tr("vs")} {slot(f.away)}
        </p>
        <div className={styles.schedule}>
          <p>
            {f.scheduledAt
              ? formatDate(f.scheduledAt, f.timeZone, tr.locale)
              : tr("Match time TBA")}
          </p>
          <p className="small muted">{f.timeZone}</p>
          <span className="badge">
            {f.completed ? tr("Completed") : tr(f.status)}
          </span>
        </div>
      </div>
      <div className={styles.assignment}>
        {f.assignment ? (
          <>
            <p>
              <strong>{f.assignment.username}</strong>
            </p>
            <p className="small muted">
              {f.assignment.source === "self"
                ? tr("Self-selected")
                : tr("Staff-assigned")}
            </p>
            <details>
              <summary className="small muted">
                {tr("Assignment details")}
              </summary>
              <p className="small muted">
                {tr("Arranged by {value0} at {value1}", {
                  value0: f.assignment.assignedByName,
                  value1: formatDate(
                    f.assignment.assignedAt,
                    f.timeZone,
                    tr.locale,
                  ),
                })}
              </p>
            </details>
            {!f.assignment.eligible && (
              <p className="notice small">
                {tr(
                  "Streamer access was revoked. Attribution is retained; reassign this task.",
                )}
              </p>
            )}
            {f.assignment.needsConfirmation && (
              <p role="status" className="notice small">
                {tr("Schedule changed — this booking needs reconfirmation.")}
              </p>
            )}
            {!!f.conflicts.length && (
              <p className="notice small">
                {tr("Same start time as: {value0}", {
                  value0: f.conflicts.map((c) => c.label).join(", "),
                })}
              </p>
            )}
          </>
        ) : (
          <p className="muted">{tr("No Streamer assigned")}</p>
        )}
      </div>
      <div className={styles.controls}>
        {available && (data.canManage || (!f.assignment && data.canSelect)) && (
          <div className={styles.assignmentForm}>
            {data.canManage && (
              <label className="field">
                <span>{tr("Assign Streamer")}</span>
                <select
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">{tr("Choose Streamer")}</option>
                  {data.candidates.map((u) => (
                    <option key={u.osuId} value={u.osuId}>
                      {u.username} · {u.osuId}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!!conflicts.length &&
              (!f.assignment || f.assignment.userId !== selectedId) && (
                <p role="status" className="notice small">
                  {tr("Same start time as: {value0}", {
                    value0: conflicts.map((c) => c.label).join(", "),
                  })}
                </p>
              )}
            <div className="actions">
              {data.canManage &&
                action(
                  "assign",
                  f.assignment
                    ? tr("Reassign Streamer")
                    : tr("Assign Streamer"),
                  Number(target) || undefined,
                )}
              {!f.assignment &&
                data.canSelect &&
                action("select", tr("Stream this match"))}
            </div>
          </div>
        )}
        {f.assignment && (data.canManage || (own && data.canSelect)) && (
          <div className="actions">
            {available &&
              f.assignment.needsConfirmation &&
              action("reconfirm", tr("Reconfirm booking"))}
            {action("cancel", tr("Cancel streaming task"))}
          </div>
        )}
      </div>
    </article>
  );
}

export function StreamingManager({
  slug,
  data,
  detail = false,
}: {
  slug: string;
  data: StreamingWorkspace;
  detail?: boolean;
}) {
  const tr = useAppTranslations();
  return (
    <section
      className={`form-stack ${styles.workspace}`}
      aria-label={tr("Streaming tasks")}
    >
      <p className="small muted">
        {tr(
          "Bookings stay private and do not publish stream links. Conflict notices compare start times in this edition only and do not block booking.",
        )}
      </p>
      {detail ? (
        <Link href={`/admin/tournaments/${slug}/streaming?view=mine`}>
          {tr("My streaming tasks")}
        </Link>
      ) : (
        <form className={styles.filters} method="get">
          <div className={styles.filterFields}>
            <label className="field">
              <span>{tr("Date (match time zone)")}</span>
              <input type="date" name="date" defaultValue={data.filters.date} />
            </label>
            <label className="field">
              <span>{tr("Round")}</span>
              <select name="round" defaultValue={data.filters.round}>
                <option value="">{tr("All rounds")}</option>
                {data.rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{tr("Tasks")}</span>
              <select name="view" defaultValue={data.filters.view}>
                <option value="all">{tr("All matches")}</option>
                <option value="unassigned">{tr("Unassigned matches")}</option>
                <option value="mine">{tr("My streaming tasks")}</option>
              </select>
            </label>
          </div>
          <div className={`actions ${styles.filterActions}`}>
            <button type="submit">{tr("Apply filters")}</button>
            <Link
              className="button secondary"
              href={`/admin/tournaments/${slug}/streaming?view=mine`}
            >
              {tr("My streaming tasks")}
            </Link>
          </div>
        </form>
      )}
      {!data.fixtures.length && (
        <p className="empty">{tr("No streaming tasks match these filters.")}</p>
      )}
      <ul className={styles.list}>
        {data.fixtures.map((f) => (
          <li key={`${f.id}:${f.streamRevision}:${f.version}`}>
            <StreamingTask slug={slug} fixture={f} data={data} />
          </li>
        ))}
      </ul>
      {detail && (
        <div className="panel form-stack">
          <h2>{tr("Streaming task history")}</h2>
          {!data.history.length && (
            <p className="muted">{tr("No streaming task changes yet.")}</p>
          )}
          <ol className="streaming-history">
            {data.history.map((h) => {
              const command = h.detail.command as { action: string };
              const task = (h.detail.after ?? h.detail.before) as {
                userId: number;
                source: string;
              } | null;
              return (
                <li key={h.id}>
                  <p>
                    {command.action === "select"
                      ? tr("Self-selected")
                      : command.action === "assign"
                        ? tr("Staff-assigned")
                        : command.action === "reconfirm"
                          ? tr("Reconfirm booking")
                          : tr("Cancel streaming task")}
                    {task ? ` · ${task.userId}` : ""}
                  </p>
                  <p className="muted small">
                    {tr("Operator osu! ID: {value0}", {
                      value0: String(h.actorId ?? ""),
                    })}{" "}
                    ·{" "}
                    {formatDate(
                      h.createdAt,
                      data.fixtures[0]?.timeZone ?? "UTC",
                      tr.locale,
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
