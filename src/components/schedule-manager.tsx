"use client";
import { useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { useAppTranslations } from "@/i18n/shared";
import type { ScheduleWorkspace } from "@/lib/schedule";
import type { ScheduleStatus } from "@/lib/schedule-model";
import { activeSchedule } from "@/lib/schedule-model";
import { ConfirmMutation } from "./confirm-mutation";
import { ZonedDateInput } from "./zoned-date-input";
import "./schedule.css";
const Calendar = dynamic(() => import("./schedule-calendar"), { ssr: false });
function Mutation(props: ComponentProps<typeof ConfirmMutation>) {
  const [requestKey] = useState(() => crypto.randomUUID());
  return (
    <ConfirmMutation {...props} payload={{ ...props.payload, requestKey }} />
  );
}
function statusLabel(
  status: ScheduleStatus,
  tr: ReturnType<typeof useAppTranslations>,
) {
  switch (status) {
    case "waiting":
      return tr("Awaiting other captain");
    case "pending":
      return tr("Awaiting staff review");
    case "approved":
      return tr("Approved");
    case "rejected":
      return tr("Rejected");
    case "withdrawn":
      return tr("Withdrawn");
    case "expired":
      return tr("Expired");
  }
}
function FixtureEditor({
  slug,
  data,
  f,
  reload,
}: {
  slug: string;
  data: ScheduleWorkspace;
  f: ScheduleWorkspace["fixtures"][number];
  reload: () => Promise<void>;
}) {
  const tr = useAppTranslations();
  const [intervals, setIntervals] = useState(f.ownAvailability.intervals);
  const [start, setStart] = useState<string | null>(null),
    [end, setEnd] = useState<string | null>(null);
  const [startValid, setStartValid] = useState(false),
    [endValid, setEndValid] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [proposal, setProposal] = useState<string | null>(null),
    [proposalValid, setProposalValid] = useState(false);
  const [note, setNote] = useState("");
  const clearSelection = () => {
    setStart(null);
    setEnd(null);
    setStartValid(false);
    setEndValid(false);
    setEditing(null);
  };
  const request = data.requests.findLast(
    (r) => r.fixtureId === f.id && activeSchedule(r.status),
  );
  const url = `/api/tournaments/${slug}/schedule/requests`;
  const base = { fixtureId: f.id, expectedFixtureVersion: f.version };
  const time = (value: string) =>
    new Intl.DateTimeFormat(tr.locale, {
      timeZone: f.timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const canCaptain = data.captain && f.participant;
  const action = (action: string, label: string, description?: string) => (
    <Mutation
      key={JSON.stringify([action, request?.version, f.version, note])}
      label={label}
      title={label}
      description={description}
      url={url}
      onSuccess={reload}
      payload={{
        ...base,
        action,
        requestId: request!.id,
        expectedVersion: request!.version,
        confirmed: true,
        ...(action === "reject" ? { decisionNote: note } : {}),
      }}
      canConfirm={
        action !== "reject" || request?.status !== "pending" || !!note.trim()
      }
    />
  );
  return (
    <article className="schedule-editor panel">
      <div className="schedule-heading">
        <div>
          <p className="muted small">
            {f.roundName} · {f.label}
          </p>
          <h2>
            {f.home} {tr("vs")} {f.away}
          </h2>
        </div>
        <div>
          <strong>{tr("Official start")}</strong>
          <p>{f.scheduledAt ? time(f.scheduledAt) : tr("Match time TBA")}</p>
          <p className="muted small">{f.timeZone}</p>
        </div>
      </div>
      {!!f.sameStart.length && (
        <p className="notice">
          {tr("Same start time as: {value0}", {
            value0: f.sameStart.join(", "),
          })}
        </p>
      )}
      {!f.eligible && (
        <p className="notice">
          {tr("This fixture is no longer available for rescheduling.")}
        </p>
      )}
      {request && (
        <section className="schedule-proposal-box">
          <span className="badge">{statusLabel(request.status, tr)}</span>
          <h3>
            {tr("Proposed start")}: {time(request.proposedAt)}
          </h3>
          <p className="muted">
            {tr("Proposed by {value0}", { value0: request.proposerName })}
          </p>
          <div className="actions">
            {f.eligible &&
              canCaptain &&
              request.status === "waiting" &&
              request.proposerId !== data.actorId && (
                <>
                  {action("accept", tr("Agree and submit to staff"))}
                  {action("reject", tr("Decline proposal"))}
                </>
              )}
            {f.eligible &&
              canCaptain &&
              (request.status === "pending" ||
                request.proposerId === data.actorId) &&
              action("withdraw", tr("Withdraw agreement"))}
            {f.eligible &&
              request.status === "pending" &&
              request.canReview && (
                <>
                  {action(
                    "approve",
                    tr("Approve schedule change"),
                    tr("Change the official start from {value0} to {value1}.", {
                      value0: time(request.basis.scheduledAt),
                      value1: time(request.proposedAt),
                    }),
                  )}
                  <label className="field">
                    <span>{tr("Decision note")}</span>
                    <textarea
                      value={note}
                      maxLength={1000}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  {action("reject", tr("Reject schedule change"))}
                </>
              )}
          </div>
        </section>
      )}
      <Calendar
        timeZone={f.timeZone}
        official={f.scheduledAt}
        proposed={request?.proposedAt}
        intervals={f.participant ? intervals : []}
        selection={
          startValid && endValid && start && end ? { start, end } : null
        }
        editingIndex={editing}
        summary={f.summary}
        editable={f.participant && f.eligible && intervals.length < 40}
        onSelect={(a, b) => {
          setIntervals((previous) =>
            previous.length < 40
              ? [...previous, { start: a, end: b }]
              : previous,
          );
          clearSelection();
          setProposal(a);
          setProposalValid(true);
        }}
      />
      {f.eligible && f.participant && (
        <div className="schedule-forms">
          <section>
            <h3>{tr("My availability")}</h3>
            <p className="muted small">
              {tr("Only you and your captain can see your time slots.")}
            </p>
            <ZonedDateInput
              hideEmptyError
              label={tr("Available from")}
              value={start}
              timeZone={f.timeZone}
              onChange={setStart}
              onValidityChange={setStartValid}
            />
            <ZonedDateInput
              hideEmptyError
              label={tr("Available until")}
              value={end}
              timeZone={f.timeZone}
              onChange={setEnd}
              onValidityChange={setEndValid}
            />
            <button
              className="secondary"
              disabled={
                !startValid ||
                !endValid ||
                !start ||
                !end ||
                Date.parse(end) <= Date.parse(start) ||
                (editing === null && intervals.length >= 40)
              }
              onClick={() => {
                if (start && end) {
                  setIntervals(
                    editing === null
                      ? [...intervals, { start, end }]
                      : intervals.map((i, n) =>
                          n === editing ? { start, end } : i,
                        ),
                  );
                  clearSelection();
                }
              }}
            >
              {editing === null ? tr("Add time slot") : tr("Update time slot")}
            </button>
            {(editing !== null || start !== null || end !== null) && (
              <button
                className="secondary"
                type="button"
                onClick={clearSelection}
              >
                {tr("Cancel")}
              </button>
            )}
            <ul className="schedule-slots">
              {intervals.map((i, n) => (
                <li key={n}>
                  <span>
                    {time(i.start)} – {time(i.end)}
                  </span>
                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditing(n);
                        setStart(i.start);
                        setEnd(i.end);
                      }}
                    >
                      {tr("Edit")}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setIntervals(
                          intervals.filter((_, index) => n !== index),
                        );
                        clearSelection();
                      }}
                    >
                      {tr("Remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Mutation
              key={JSON.stringify([intervals, f.ownAvailability.version])}
              label={tr("Save availability")}
              title={tr("Save availability")}
              requireConfirmation={false}
              url={url}
              onSuccess={reload}
              payload={{
                ...base,
                action: "availability",
                expectedVersion: f.ownAvailability.version,
                intervals,
              }}
            />
            <p className="muted small">
              {tr(
                "Time slots are saved only after you select Save availability.",
              )}
            </p>
          </section>
          {canCaptain && (!request || request.status === "waiting") && (
            <section>
              <h3>{tr("Propose a new start")}</h3>
              <ZonedDateInput
                hideEmptyError
                label={tr("Proposed start")}
                value={proposal}
                timeZone={f.timeZone}
                onChange={setProposal}
                onValidityChange={setProposalValid}
              />
              <Mutation
                key={JSON.stringify([proposal, request?.version, f.version])}
                label={tr("Send time proposal")}
                title={tr("Send time proposal")}
                description={tr(
                  "The official start stays unchanged until both captains agree and staff approves.",
                )}
                url={url}
                onSuccess={reload}
                disabled={!proposalValid || !proposal}
                payload={{
                  ...base,
                  action: "propose",
                  requestId: request?.id ?? null,
                  expectedVersion: request?.version ?? 0,
                  proposedAt: proposal,
                  confirmed: true,
                }}
              />
            </section>
          )}
        </div>
      )}
      {canCaptain && (
        <section>
          <h3>{tr("Team availability")}</h3>
          <p className="muted">
            {tr("{value0} players have not submitted availability.", {
              value0: f.unreported,
            })}
          </p>
          <ul>
            {f.roster.map((m) => (
              <li key={m.userId}>
                <strong>{m.username}</strong>:{" "}
                {m.intervals.length
                  ? m.intervals
                      .map((i) => `${time(i.start)} – ${time(i.end)}`)
                      .join("; ")
                  : tr("Not submitted")}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.admin && (
        <p className="notice">
          {tr("Referees")}: {f.referees.join(", ") || "—"} · {tr("Streamer")}:{" "}
          {f.streamer ?? "—"}.{" "}
          {tr(
            "Referee and streaming bookings must be reconfirmed after a schedule change.",
          )}{" "}
          <a
            className="text-link"
            href={`/admin/tournaments/${slug}/matches/${f.id}`}
          >
            {tr("Match details")}
          </a>
        </p>
      )}
      <section>
        <h3>{tr("Request history")}</h3>
        {data.requests
          .filter((r) => r.fixtureId === f.id)
          .toReversed()
          .map((r) => (
            <details key={r.id}>
              <summary>
                {statusLabel(r.status, tr)} · {time(r.proposedAt)}
              </summary>
              <p>
                {tr("Official start")}: {time(r.basis.scheduledAt)}
              </p>
              {r.decisionNote && <p>{r.decisionNote}</p>}
              <ol>
                {r.history.map((e) => (
                  <li key={e.id}>
                    {time(e.at)} ·{" "}
                    {e.actor ??
                      (e.action === "expired"
                        ? tr("System")
                        : tr("Staff"))}{" "}
                    ·{" "}
                    {e.action === "propose"
                      ? tr("Time proposed")
                      : e.action === "accept"
                        ? tr("Captain agreed")
                        : e.action === "approve"
                          ? tr("Staff approved")
                          : e.action === "withdraw"
                            ? tr("Withdrawn")
                            : e.action === "expired"
                              ? tr("Expired")
                              : tr("Rejected")}
                    {e.proposedAt ? ` · ${time(e.proposedAt)}` : ""}
                  </li>
                ))}
              </ol>
            </details>
          ))}
      </section>
    </article>
  );
}
export function ScheduleManager({
  slug,
  data: initial,
}: {
  slug: string;
  data: ScheduleWorkspace;
}) {
  const tr = useAppTranslations();
  const [data, setData] = useState(initial),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(initial.fixtures[0]?.id ?? "");
  const [status, setStatus] = useState(initial.admin ? "pending" : "all"),
    [round, setRound] = useState("");
  async function reload() {
    const response = await fetch(`/api/tournaments/${slug}/schedule/requests`, {
      cache: "no-store",
    });
    if (!response.ok) {
      setError(tr("Reload failed. Refresh before continuing."));
      return;
    }
    setData(await response.json());
    setError("");
  }
  const listed = data.fixtures.filter(
    (f) =>
      (!round || f.roundId === round) &&
      (status === "all" ||
        data.requests.some((r) => r.fixtureId === f.id && r.status === status)),
  );
  const f = listed.find((f) => f.id === selected) ?? listed[0];
  return (
    <div className="schedule-tool">
      <div className="actions schedule-filters">
        <label className="field">
          <span>{tr("Round")}</span>
          <select
            aria-label={tr("Round")}
            value={round}
            onChange={(e) => setRound(e.target.value)}
          >
            <option value="">{tr("All rounds")}</option>
            {[
              ...new Map(
                data.fixtures.map((f) => [f.roundId, f.roundName]),
              ).entries(),
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{tr("Request status")}</span>
          <select
            aria-label={tr("Request status")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">{tr("All requests")}</option>
            {(
              [
                "waiting",
                "pending",
                "approved",
                "rejected",
                "withdrawn",
                "expired",
              ] as const
            ).map((s) => (
              <option key={s} value={s}>
                {statusLabel(s, tr)}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" onClick={() => void reload()}>
          {tr("Reload schedule")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <label className="field">
        <span>{tr("Match")}</span>
        <select
          aria-label={tr("Match")}
          value={f?.id ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {listed.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} · {f.home} vs {f.away}
            </option>
          ))}
        </select>
      </label>
      {f ? (
        <FixtureEditor
          key={JSON.stringify([
            f,
            data.requests
              .filter((r) => r.fixtureId === f.id)
              .map((r) => [r.id, r.version, r.status]),
          ])}
          slug={slug}
          data={data}
          f={f}
          reload={reload}
        />
      ) : (
        <p className="notice">{tr("No matching schedule requests.")}</p>
      )}
      {data.admin &&
        data.requests
          .filter((r) => !r.fixtureId)
          .map((r) => (
            <details key={r.id}>
              <summary>
                {r.label} · {statusLabel(r.status, tr)}
              </summary>
              <p>{tr("Original fixture removed; request history retained.")}</p>
              <p>
                {r.basis.scheduledAt} → {r.proposedAt}
              </p>
            </details>
          ))}
    </div>
  );
}
