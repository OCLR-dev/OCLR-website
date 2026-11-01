"use client";
import styles from "./streaming-manager.module.css";
import Link from "next/link";
import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { StreamingWorkspace } from "@/lib/streaming";
import { formatDate } from "@/lib/editions";
import { ConfirmMutation } from "./confirm-mutation";
type Fixture = StreamingWorkspace["fixtures"][number];
type Assignment = NonNullable<Fixture["assignment"]>;
function StreamingMutation(
  props: React.ComponentProps<typeof ConfirmMutation>,
) {
  const [requestKey] = useState(() => crypto.randomUUID());
  return (
    <ConfirmMutation {...props} payload={{ ...props.payload, requestKey }} />
  );
}
function BookingDetails({
  assignment: task,
  fixture: f,
  commentary,
  conflicts,
}: {
  assignment: Assignment;
  fixture: Fixture;
  commentary: boolean;
  conflicts: Fixture["conflicts"];
}) {
  const tr = useAppTranslations();
  return (
    <div className={styles.assignment}>
      <p>
        <strong>{task.username}</strong>
      </p>
      <p className="small muted">
        {task.source === "self" ? tr("Self-selected") : tr("Staff-assigned")}
      </p>
      <details>
        <summary className="small muted">{tr("Assignment details")}</summary>
        <p className="small muted">
          {tr("Arranged by {value0} at {value1}", {
            value0: task.assignedByName,
            value1: formatDate(task.assignedAt, f.timeZone, tr.locale),
          })}
        </p>
      </details>
      {!task.eligible && (
        <p className="notice small">
          {commentary
            ? tr(
                "Commentator access was revoked. Attribution is retained; cancel or replace this task.",
              )
            : tr(
                "Streamer access was revoked. Attribution is retained; reassign this task.",
              )}
        </p>
      )}
      {task.needsConfirmation && (
        <p role="status" className="notice small">
          {commentary
            ? tr(
                "Schedule changed — this commentary booking needs reconfirmation.",
              )
            : tr("Schedule changed — this booking needs reconfirmation.")}
        </p>
      )}
      {!!conflicts.length && (
        <p className="notice small">
          {tr("Same start time as: {value0}", {
            value0: conflicts.map((c) => c.label).join(", "),
          })}
        </p>
      )}
    </div>
  );
}
function BroadcastBookings({
  slug,
  fixture: f,
  data,
  commentary = false,
}: {
  slug: string;
  fixture: Fixture;
  data: StreamingWorkspace;
  commentary?: boolean;
}) {
  const tr = useAppTranslations();
  const [target, setTarget] = useState(
    commentary ? "" : String(f.assignment?.userId ?? ""),
  );
  const available =
    data.operational && f.status === "scheduled" && !f.completed;
  const canSelect = commentary ? data.canSelectCommentary : data.canSelect;
  const assignments = commentary
    ? f.commentators
    : f.assignment
      ? [{ ...f.assignment, conflicts: f.conflicts }]
      : [];
  const own = assignments.some((task) => task.userId === data.actorId);
  const candidates = commentary ? data.commentaryCandidates : data.candidates;
  const selectedId = data.canManage ? Number(target) : data.actorId;
  const conflicts = f.sameStartBookings.filter((b) => b.userId === selectedId);
  function action(action: string, label: string, userId?: number) {
    return (
      <StreamingMutation
        key={`${commentary}:${action}:${userId ?? ""}:${f.streamRevision}:${f.version}`}
        label={label}
        title={
          commentary
            ? tr("Confirm commentary task change?")
            : tr("Confirm streaming task change?")
        }
        url={`/api/admin/tournaments/${slug}/streaming/${f.id}`}
        payload={{
          action,
          ...(commentary ? { task: "commentary" } : {}),
          ...(userId ? { userId } : {}),
          expectedRevision: f.streamRevision,
          expectedFixtureVersion: f.version,
          confirmed: true,
        }}
        disabled={action === "assign" && !userId}
      />
    );
  }
  return (
    <section
      className={styles.roleTask}
      aria-label={commentary ? tr("Commentators") : tr("Streamer")}
    >
      <h3>{commentary ? tr("Commentators") : tr("Streamer")}</h3>
      {!assignments.length && (
        <p className="muted">
          {commentary
            ? tr("No Commentators assigned")
            : tr("No Streamer assigned")}
        </p>
      )}
      <ul className={styles.bookedPeople}>
        {assignments.map((task) => (
          <li key={task.userId}>
            <div role="group" aria-label={task.username}>
              <BookingDetails
                assignment={task}
                fixture={f}
                commentary={commentary}
                conflicts={task.conflicts}
              />
              {(data.canManage ||
                (task.userId === data.actorId && canSelect)) && (
                <div className="actions">
                  {available &&
                    task.needsConfirmation &&
                    action(
                      "reconfirm",
                      commentary
                        ? tr("Reconfirm commentary booking")
                        : tr("Reconfirm booking"),
                      commentary ? task.userId : undefined,
                    )}
                  {action(
                    "cancel",
                    commentary
                      ? tr("Cancel commentary task")
                      : tr("Cancel streaming task"),
                    commentary ? task.userId : undefined,
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {available &&
        (data.canManage ||
          (canSelect && (commentary ? !own : !f.assignment))) && (
          <div className={styles.controls}>
            {data.canManage && (
              <label className="field">
                <span>
                  {commentary
                    ? tr("Assign Commentator")
                    : tr("Assign Streamer")}
                </span>
                <select
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">
                    {commentary
                      ? tr("Choose Commentator")
                      : tr("Choose Streamer")}
                  </option>
                  {candidates
                    .filter(
                      (u) =>
                        !commentary ||
                        !assignments.some((task) => task.userId === u.osuId),
                    )
                    .map((u) => (
                      <option key={u.osuId} value={u.osuId}>
                        {u.username} · {u.osuId}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {!!conflicts.length &&
              !assignments.some((task) => task.userId === selectedId) && (
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
                  commentary
                    ? tr("Assign Commentator")
                    : f.assignment
                      ? tr("Reassign Streamer")
                      : tr("Assign Streamer"),
                  Number(target) || undefined,
                )}
              {canSelect &&
                (commentary ? !own : !f.assignment) &&
                action(
                  "select",
                  commentary
                    ? tr("Commentate this match")
                    : tr("Stream this match"),
                )}
            </div>
          </div>
        )}
    </section>
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
      <div className={styles.bookings}>
        <BroadcastBookings slug={slug} fixture={f} data={data} />
        <BroadcastBookings slug={slug} fixture={f} data={data} commentary />
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
          {tr("My broadcast tasks")}
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
                <option value="mine">{tr("My broadcast tasks")}</option>
              </select>
            </label>
          </div>
          <div className={`actions ${styles.filterActions}`}>
            <button type="submit">{tr("Apply filters")}</button>
            <Link
              className="button secondary"
              href={`/admin/tournaments/${slug}/streaming?view=mine`}
            >
              {tr("My broadcast tasks")}
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
                    {(h.detail.command as { task?: string }).task ===
                      "commentary" && <> {tr("Commentator")} · </>}
                    {command.action === "select"
                      ? tr("Self-selected")
                      : command.action === "assign"
                        ? tr("Staff-assigned")
                        : command.action === "reconfirm"
                          ? (h.detail.command as { task?: string }).task ===
                            "commentary"
                            ? tr("Reconfirm commentary booking")
                            : tr("Reconfirm booking")
                          : (h.detail.command as { task?: string }).task ===
                              "commentary"
                            ? tr("Cancel commentary task")
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
