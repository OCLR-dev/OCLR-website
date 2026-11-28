"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import { formatDate } from "@/lib/editions";
import type { GroupSchedulePreview } from "@/lib/fixture-write-contracts";
import { defaultGroupScheduleTimes } from "@/lib/group-schedule-model";
import { ConfirmMutation } from "./confirm-mutation";
import { jsonMutationRequest } from "./json-mutation-request";
import { PendingButtonLabel } from "./pending-button-label";

export function GroupScheduler({
  slug,
  stageId,
  version,
  rounds,
  teams,
  timeZone,
  disabled,
}: {
  slug: string;
  stageId: string;
  version: number;
  rounds: readonly { id: string; name: string }[];
  teams: readonly { id: string; name: string }[];
  timeZone: string;
  disabled: boolean;
}) {
  const tr = useAppTranslations();
  const formId = useId();
  const [roundId, setRoundId] = useState(rounds[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [times, setTimes] = useState<string[]>([...defaultGroupScheduleTimes]);
  const [preview, setPreview] = useState<GroupSchedulePreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const url = `/api/admin/tournaments/${slug}/matches`;
  const timeSlots = times.filter(Boolean);
  const duplicateTimes = new Set(timeSlots).size !== timeSlots.length;
  const invertedDates = Boolean(startDate && endDate && endDate < startDate);
  const fields = {
    stageId,
    expectedVersion: version,
    roundId,
    startDate,
    endDate,
    times: timeSlots,
  };
  const canPreview =
    !disabled &&
    !pending &&
    rounds.some((round) => round.id === roundId) &&
    startDate &&
    endDate &&
    !invertedDates &&
    timeSlots.length > 0 &&
    !duplicateTimes;
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  async function previewSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPreview) return;
    setPending(true);
    setPreview(null);
    setError("");
    setSaved(false);
    try {
      const response = await jsonMutationRequest(url, {
        ...fields,
        action: "preview_group_schedule",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPreview(data);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The action could not be completed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="panel group-scheduler">
      <summary>{tr("Automatic group schedule")}</summary>
      <div className="form-stack group-scheduler-body">
        {disabled && (
          <p className="small muted">
            {tr("Save group assignments before scheduling matches.")}
          </p>
        )}
        <p className="small muted">
          {tr(
            "Matches use Saturday and Sunday slots within these dates. Teams can play zero or multiple matches per week. Times use {timeZone}.",
            { timeZone },
          )}
        </p>
        <form
          id={formId}
          className="form-stack"
          onSubmit={previewSchedule}
          onChange={() => {
            setPreview(null);
            setError("");
            setSaved(false);
          }}
        >
          <fieldset
            className="form-stack staff-readonly-fields"
            disabled={disabled || pending}
          >
            <label className="field">
              <span>{tr("Competition round")}</span>
              <select
                value={roundId}
                onChange={(event) => setRoundId(event.target.value)}
              >
                {!rounds.length && (
                  <option value="">{tr("No rounds configured")}</option>
                )}
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label className="field">
                <span>{tr("Schedule start date")}</span>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{tr("Schedule end date")}</span>
                <input
                  type="date"
                  required
                  min={startDate || undefined}
                  value={endDate}
                  aria-invalid={invertedDates || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
            {invertedDates && (
              <p className="small error-text" role="alert">
                {tr("The end date must be on or after the start date.")}
              </p>
            )}
            <div className="form-grid">
              {times.map((time, index) => (
                <label key={index} className="field">
                  <span>
                    {tr("Match time {number}", { number: index + 1 })}
                  </span>
                  <input
                    type="time"
                    value={time}
                    aria-invalid={duplicateTimes}
                    onChange={(event) => {
                      setTimes(
                        times.map((value, slot) =>
                          slot === index ? event.target.value : value,
                        ),
                      );
                    }}
                  />
                </label>
              ))}
            </div>
            {duplicateTimes && (
              <p className="small error-text">
                {tr("Choose distinct match times.")}
              </p>
            )}
          </fieldset>
        </form>
        <div className="actions">
          <button
            type="submit"
            form={formId}
            className="secondary"
            disabled={!canPreview}
            aria-busy={pending}
          >
            <PendingButtonLabel pending={pending}>
              {tr("Preview group schedule")}
            </PendingButtonLabel>
          </button>
          {preview && preview.matches.length > 0 && (
            <ConfirmMutation
              title={tr("Create these group matches?")}
              label={tr("Create group matches")}
              description={tr(
                "This creates unpublished fixtures from the preview. Existing matches stay on the schedule.",
              )}
              url={url}
              payload={{
                ...fields,
                action: "create_group_schedule",
                expectedFingerprint: preview.fingerprint,
                confirmed: true,
              }}
              loadingFeedback="button"
              disabled={!canPreview}
              onSuccess={() => {
                setPreview(null);
                setSaved(true);
              }}
            />
          )}
        </div>
        {error && (
          <p className="notice error-text" role="alert">
            {tr(error)}
          </p>
        )}
        {saved && (
          <div role="status" className="notice">
            {tr("Group matches created.")}{" "}
            <Link
              className="text-link"
              href={`/admin/tournaments/${slug}/matches`}
            >
              {tr("Open fixtures")}
            </Link>
          </div>
        )}
        {preview &&
          (preview.matches.length ? (
            <div className="form-stack">
              <p className="small muted" role="status">
                {tr(
                  "{count, plural, one {# match to create} other {# matches to create}}",
                  { count: preview.matches.length },
                )}
              </p>
              <ol className="group-schedule-preview">
                {preview.matches.map((match) => (
                  <li key={match.position}>
                    <strong>
                      {teamNames.get(match.homeTeamId)} ·{" "}
                      {teamNames.get(match.awayTeamId)}
                    </strong>
                    <span className="small muted">
                      {match.group} ·{" "}
                      {formatDate(
                        match.scheduledAt,
                        preview.timeZone,
                        tr.locale,
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="small muted" role="status">
              {tr("All group pairings already have fixtures.")}
            </p>
          ))}
      </div>
    </details>
  );
}
