"use client";
import { competitionStageLabel } from "@/lib/competition-stage";

import { InfoNote } from "@/components/info-note";
import { ForceFixtureDelete } from "./force-fixture-delete";

import {
  ReadOnlyFields,
  StaffReadOnlyContext,
  useStaffReadOnly,
} from "./staff-read-only";

import { useAppTranslations } from "@/i18n/shared";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingRegion } from "./loading-region";
import { WorkspaceTabs } from "./workspace-tabs";
import { BracketView } from "./bracket-view";
import {
  chronologicalFixtures,
  fixtureBracket,
  fixtureSlot,
  groupedFixtures,
} from "@/lib/fixture-views";
import { formatDate } from "@/lib/editions";
import type { FixtureWorkspace } from "@/lib/fixture-reads";
import { RefereeAssignment } from "./referee-assignment";
import { TimeZonePicker } from "./time-zone-picker";
import { ZonedDateInput } from "./zoned-date-input";
import { ConfirmMutation } from "./confirm-mutation";
type Fixture = FixtureWorkspace["fixtures"][number];
function FixtureForm({
  slug,
  data,
  fixture,
  onSaved,
}: {
  slug: string;
  data: FixtureWorkspace;
  fixture?: Fixture;
  onSaved?: () => void;
}) {
  const tr = useAppTranslations();

  const [label, setLabel] = useState(fixture?.label ?? "");
  const [roundId, setRound] = useState(
    fixture?.roundId ?? data.rounds[0]?.round.id ?? "",
  );
  const [homeTeamId, setHome] = useState(fixture?.homeTeamId ?? "");
  const [awayTeamId, setAway] = useState(fixture?.awayTeamId ?? "");
  const [redName, setRedName] = useState(
    fixture?.exhibitionSides?.redName ??
      data.teams.find((t) => t.id === fixture?.homeTeamId)?.name ??
      tr("Red Team"),
  );
  const [blueName, setBlueName] = useState(
    fixture?.exhibitionSides?.blueName ??
      data.teams.find((t) => t.id === fixture?.awayTeamId)?.name ??
      tr("Blue Team"),
  );
  const [mappoolId, setPool] = useState(fixture?.mappoolId ?? "");
  function nextPosition(id: string) {
    return String(
      Math.max(
        0,
        ...data.fixtures.filter((f) => f.roundId === id).map((f) => f.position),
      ) + 1,
    );
  }
  const [position, setPosition] = useState(
    String(fixture?.position ?? nextPosition(roundId)),
  );
  const [time, setTime] = useState<string | null>(
    fixture?.scheduledAt?.toISOString() ?? null,
  );
  const [timeValid, setTimeValid] = useState(true);
  const [timeZone, setZone] = useState(fixture?.timeZone ?? data.timeZone);
  const [status, setStatus] = useState(fixture?.status ?? "scheduled");
  const [homeSourceId, setHomeSource] = useState(fixture?.homeSourceId ?? "");
  const [homeSourceOutcome, setHomeOutcome] = useState(
    fixture?.homeSourceOutcome ?? "winner",
  );
  const [awaySourceId, setAwaySource] = useState(fixture?.awaySourceId ?? "");
  const [awaySourceOutcome, setAwayOutcome] = useState(
    fixture?.awaySourceOutcome ?? "winner",
  );
  const round = data.rounds.find((r) => r.round.id === roundId);
  const exhibition = round?.stage === "exhibition";
  const knockout = round?.stage === "knockout";
  // Keep legacy official-team result history intact when only editing its schedule.
  const legacyExhibition =
    exhibition &&
    !fixture?.exhibitionSides &&
    Boolean(fixture?.homeTeamId || fixture?.awayTeamId) &&
    redName === data.teams.find((t) => t.id === fixture?.homeTeamId)?.name &&
    blueName === data.teams.find((t) => t.id === fixture?.awayTeamId)?.name;
  const payload = {
    label,
    roundId,
    homeTeamId: exhibition && !legacyExhibition ? null : homeTeamId || null,
    awayTeamId: exhibition && !legacyExhibition ? null : awayTeamId || null,
    ...(exhibition && !legacyExhibition
      ? { exhibitionNames: { red: redName, blue: blueName } }
      : {}),
    mappoolId: mappoolId || null,
    position: Number(position),
    scheduledAt: time,
    timeZone,
    status,
    homeSourceId: knockout && homeSourceId ? homeSourceId : null,
    homeSourceOutcome: knockout && homeSourceId ? homeSourceOutcome : null,
    awaySourceId: knockout && awaySourceId ? awaySourceId : null,
    awaySourceOutcome: knockout && awaySourceId ? awaySourceOutcome : null,
    action: fixture ? "edit" : "create",
    ...(fixture
      ? { fixtureId: fixture.id, expectedVersion: fixture.version }
      : {}),
    confirmed: true,
  };
  const teamOptions = data.teams.map((t) => (
    <option
      value={t.id}
      key={t.id}
      disabled={Boolean(fixture?.publishedAt && t.unpublished)}
    >
      {t.name}
      {t.unpublished ? ` · ${tr("Unpublished")}` : ""}
    </option>
  ));
  function sourceSelect(side: "home" | "away") {
    const id = side === "home" ? homeSourceId : awaySourceId;
    const setId = side === "home" ? setHomeSource : setAwaySource;
    const outcome = side === "home" ? homeSourceOutcome : awaySourceOutcome;
    const setOutcome = side === "home" ? setHomeOutcome : setAwayOutcome;
    return (
      <div className="form-stack">
        <label className="field">
          <span>
            {side === "home" ? tr("Home") : tr("Away")} {tr(" bracket source")}
          </span>
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">
              {tr("Direct team slot — no progression link")}
            </option>
            {data.fixtures
              .filter(
                (f) =>
                  f.id !== fixture?.id &&
                  data.rounds.find((r) => r.round.id === f.roundId)?.stage ===
                    "knockout",
              )
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
          </select>
        </label>
        {id && (
          <label className="field">
            <span>
              {side === "home" ? tr("Home") : tr("Away")}{" "}
              {tr(" source outcome")}
            </span>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as "winner" | "loser")}
            >
              <option value="winner">{tr("Winner")}</option>
              <option value="loser">{tr("Loser")}</option>
            </select>
          </label>
        )}
      </div>
    );
  }
  return (
    <ReadOnlyFields>
      <div className="form-stack fixture-form">
        <div className="form-grid">
          <label className="field">
            <span>{tr("Fixture label")}</span>
            <input
              value={label}
              maxLength={100}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{tr("Competition round")}</span>
            <select
              value={roundId}
              onChange={(e) => {
                setRound(e.target.value);
                setPool("");
                if (!fixture) setPosition(nextPosition(e.target.value));
              }}
            >
              {!data.rounds.length && (
                <option value="">{tr("No rounds configured")}</option>
              )}
              {data.rounds.map((r) => (
                <option key={r.round.id} value={r.round.id}>
                  {tr(competitionStageLabel(r.stage))} / {r.round.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="fixture-form-section">
          <legend>{tr("Teams")}</legend>
          {exhibition && (
            <p className="muted small">
              {tr(
                "Open participation; sides follow each game’s recorded red and blue colors.",
              )}
            </p>
          )}
          <div className="form-grid">
            <label className="field">
              <span>{tr("Red Team")}</span>
              {exhibition ? (
                <input
                  value={redName}
                  onChange={(e) => setRedName(e.target.value)}
                  maxLength={100}
                  required
                />
              ) : (
                <select
                  value={homeTeamId}
                  onChange={(e) => setHome(e.target.value)}
                >
                  <option value="">{tr("Team TBD")}</option>
                  {teamOptions}
                </select>
              )}
            </label>
            <label className="field">
              <span>{tr("Blue Team")}</span>
              {exhibition ? (
                <input
                  value={blueName}
                  onChange={(e) => setBlueName(e.target.value)}
                  maxLength={100}
                  required
                />
              ) : (
                <select
                  value={awayTeamId}
                  onChange={(e) => setAway(e.target.value)}
                >
                  <option value="">{tr("Team TBD")}</option>
                  {teamOptions}
                </select>
              )}
            </label>
          </div>
        </fieldset>
        {!exhibition &&
          (!homeTeamId ||
            !awayTeamId ||
            data.teams.some(
              (t) =>
                t.unpublished && (t.id === homeTeamId || t.id === awayTeamId),
            )) && (
            <p className="muted small">
              {tr(
                "Unpublished teams can be saved in private fixtures for testing. Reporting and publication still require finalized, published teams.",
              )}
            </p>
          )}
        <ZonedDateInput
          label={tr("Scheduled date and time")}
          value={time}
          timeZone={timeZone}
          onChange={setTime}
          onValidityChange={setTimeValid}
          optional
        />
        <fieldset className="fixture-form-section">
          <legend>{tr("Match options")}</legend>
          <div className="form-grid">
            <label className="field">
              <span>{tr("Fixture order within round")}</span>
              <input
                type="number"
                min={1}
                max={999}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </label>
            <label className="field">
              <span>{tr("Associated mappool")}</span>
              <select
                value={mappoolId}
                onChange={(e) => setPool(e.target.value)}
              >
                <option value="">{tr("No pool associated")}</option>
                {data.pools
                  .filter((p) => p.roundId === roundId)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <TimeZonePicker value={timeZone} onChange={setZone} />
            <InfoNote>
              <p className="muted small">
                {tr(
                  "Changing the time zone keeps the scheduled instant and updates the displayed local time.",
                )}
              </p>
            </InfoNote>

            <label className="field">
              <span>{tr("Fixture status")}</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Fixture["status"])}
              >
                <option value="scheduled">{tr("Scheduled")}</option>
                <option value="in_progress">{tr("In progress")}</option>
                <option value="cancelled">{tr("Cancelled")}</option>
              </select>
            </label>
            {round?.stage === "knockout" && (
              <fieldset className="settings-card form-stack">
                <legend>{tr("Explicit bracket progression")}</legend>
                <InfoNote>
                  <p className="muted">
                    {tr(
                      "Link planned slots to a previous match. Confirm the official teams before reporting results.",
                    )}
                  </p>
                </InfoNote>
                {sourceSelect("home")}
                {sourceSelect("away")}
              </fieldset>
            )}
          </div>
        </fieldset>
        <ConfirmMutation
          requireConfirmation={false}
          onSuccess={onSaved}
          disabled={!timeValid}
          canConfirm={
            Boolean(
              label.trim() &&
              roundId &&
              (!exhibition || (redName.trim() && blueName.trim())),
            ) &&
            (exhibition ||
              !homeTeamId ||
              !awayTeamId ||
              homeTeamId !== awayTeamId) &&
            Number.isInteger(Number(position)) &&
            Number(position) >= 1 &&
            Number(position) <= 999
          }
          label={fixture ? tr("Save fixture amendment") : tr("Create fixture")}
          title={fixture ? tr("Amend fixture?") : tr("Create fixture?")}
          url={`/api/admin/tournaments/${slug}/matches`}
          payload={payload}
        />
      </div>
    </ReadOnlyFields>
  );
}
export function FixtureManager({
  slug,
  data,
}: {
  slug: string;
  data: FixtureWorkspace;
}) {
  const readOnly = useStaffReadOnly();
  const viewManagement = data.canManage || data.canViewAll;
  const tr = useAppTranslations();

  const [navigating, startNavigation] = useTransition();
  const router = useRouter(),
    query = useSearchParams();
  const requested = query.get("view");
  const view =
    requested === "groups" || requested === "bracket" ? requested : "schedule";
  const [roundId, setRound] = useState("");
  const [notice, setNotice] = useState("");
  const createButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<Fixture | "new" | null>(null);
  // Keep the opened snapshot (and its draft) until the operator explicitly reloads.
  // A refresh supplies current props but deliberately preserves this local state.
  const latest =
    editing && editing !== "new"
      ? data.fixtures.find((fixture) => fixture.id === editing.id)
      : undefined;
  const stale = Boolean(
    editing &&
    editing !== "new" &&
    (!latest ||
      latest.version !== editing.version ||
      latest.assignmentRevision !== editing.assignmentRevision),
  );
  const recoveryNotice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stale) recoveryNotice.current?.focus();
  }, [stale]);
  const editor = useRef<HTMLDialogElement>(null),
    id = useId();
  const bracket = fixtureBracket(slug, data);
  const groups = groupedFixtures(data, roundId);
  function open(fixture: Fixture | "new") {
    setEditing(fixture);
    editor.current?.showModal();
  }
  function card(f: Fixture) {
    const round = data.rounds.find((r) => r.round.id === f.roundId);
    return (
      <>
        <header className="fixture-match-heading">
          <div>
            <h3 id={`match-${f.id}`}>{f.label}</h3>
            <p className="small muted">{round?.round.name}</p>
          </div>
          <span className="badge">
            {
              {
                scheduled: tr("Scheduled"),
                in_progress: tr("In progress"),
                cancelled: tr("Cancelled"),
              }[f.status]
            }
          </span>
        </header>
        <div className="fixture-matchup">
          {(["home", "away"] as const).map((side) => {
            const slot = fixtureSlot(data, f, side);
            const source = data.fixtures.find(
              (s) => s.id === slot.sourceMatchId,
            );
            return (
              <div className="fixture-team" data-bracket-slot key={side}>
                {side === "away" && (
                  <span className="fixture-versus muted">{tr(" vs")}</span>
                )}
                <div>
                  <strong>{slot.label}</strong>
                  {source && slot.teamId && (
                    <small className="muted">
                      {slot.kind === "loser" ? tr("Loser") : tr("Winner")}{" "}
                      {tr(" of ")}
                      {source.label}
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="fixture-summary">
          <p className="small muted">
            {f.scheduledAt
              ? tr(formatDate(f.scheduledAt, f.timeZone, tr.locale))
              : tr("Time TBA")}
          </p>
          <p className="small">
            <span className="badge">
              {f.publishedAt
                ? tr("Published fixture")
                : tr("Unpublished fixture")}
            </span>{" "}
            ·{" "}
            {f.result ? (
              <>
                {
                  {
                    draft: tr("Draft result"),
                    submitted: tr("Submitted result"),
                    approved: tr("Approved result"),
                  }[f.result.state]
                }
                {f.result.publishedRevision !== null && (
                  <> · {tr("Published result")}</>
                )}
              </>
            ) : (
              tr("No result submitted")
            )}
          </p>
          <p className="small muted">
            {tr("Assigned referees:")}{" "}
            {f.referees.map((r) => r.username).join(", ") || tr("None")}
          </p>
        </div>
        <div className="actions fixture-actions">
          <Link
            className="button"
            href={`/admin/tournaments/${slug}/matches/${f.id}/referee`}
          >
            {tr("Referee panel")}
          </Link>
          <Link
            className="button"
            href={`/admin/tournaments/${slug}/matches/${f.id}`}
          >
            {tr("Open match")}
          </Link>
          {viewManagement && (
            <>
              <RefereeAssignment slug={slug} fixture={f} data={data} />
              <button
                className="secondary"
                type="button"
                onClick={() => open(f)}
              >
                {tr("Manage fixture")}
              </button>
            </>
          )}
        </div>
      </>
    );
  }
  function cards(matches: Fixture[]) {
    return (
      <div className="fixture-grid">
        {chronologicalFixtures(matches).map((f) => (
          <article
            className="match-card fixture-card"
            key={f.id}
            aria-labelledby={`match-${f.id}`}
          >
            {card(f)}
          </article>
        ))}
      </div>
    );
  }
  return (
    <div className="fixture-workspace stack">
      {navigating && <LoadingRegion />}
      {notice && (
        <p role="status" className="notice small">
          {tr(notice)}
        </p>
      )}
      <div className="fixture-toolbar" aria-busy={navigating}>
        <WorkspaceTabs
          appearance="line"
          id="fixture-views"
          label={tr("Fixture views")}
          value={view}
          items={[
            { value: "schedule", label: "Schedule" },
            { value: "groups", label: "Groups" },
            { value: "bracket", label: "Bracket" },
          ]}
          onChange={(value) => {
            const next = new URLSearchParams(query.toString());
            next.set("view", value);
            startNavigation(() =>
              router.replace(`?${next}`, { scroll: false }),
            );
          }}
        />
        {viewManagement && (
          <button
            type="button"
            className="secondary"
            disabled={!data.rounds.length}
            ref={createButton}
            onClick={() => open("new")}
          >
            {tr("Create a fixture")}
          </button>
        )}
      </div>
      {viewManagement && !data.rounds.length && (
        <p className="muted small">
          {tr("No rounds configured")} ·{" "}
          <Link
            className="context-link"
            href={`/admin/tournaments/${slug}/rounds`}
          >
            {tr("Manage rounds")}
          </Link>
        </p>
      )}
      <div
        id="fixture-views-panel"
        role="tabpanel"
        aria-labelledby={`fixture-views-${view}`}
        tabIndex={0}
      >
        {view === "schedule" &&
          (data.fixtures.length ? (
            cards(data.fixtures)
          ) : (
            <p className="muted">
              {viewManagement
                ? tr("No fixtures yet.")
                : tr("No matches assigned to you.")}
            </p>
          ))}
        {view === "groups" && (
          <div className="stack">
            <label className="field fixture-round-filter">
              <span>{tr("Group round")}</span>
              <select
                value={roundId}
                onChange={(e) => setRound(e.target.value)}
              >
                <option value="">{tr("All rounds")}</option>
                {data.rounds
                  .filter((r) => r.stage === "group")
                  .map((r) => (
                    <option value={r.round.id} key={r.round.id}>
                      {r.round.name}
                    </option>
                  ))}
              </select>
            </label>
            {groups.length ? (
              groups.map((group) => (
                <section key={group.id}>
                  <h2>{group.name}</h2>
                  {cards(group.fixtures)}
                </section>
              ))
            ) : (
              <p className="muted">{tr("No group fixtures in this round.")}</p>
            )}
          </div>
        )}
        {view === "bracket" &&
          (bracket ? (
            <BracketView
              bracket={bracket}
              renderMatch={(match) =>
                card(data.fixtures.find((f) => f.id === match.id)!)
              }
            />
          ) : (
            <p className="muted">{tr("No knockout fixtures yet.")}</p>
          ))}
      </div>
      {viewManagement && (
        <>
          <dialog
            className="fixture-editor-dialog"
            ref={editor}
            aria-labelledby={`${id}-editor`}
          >
            <div className="fixture-toolbar" aria-busy={navigating}>
              <h2 id={`${id}-editor`}>
                {editing === "new" ? tr("Create a fixture") : editing?.label}
              </h2>
              <button
                type="button"
                className="secondary"
                onClick={() => editor.current?.close()}
              >
                {tr("Close")}
              </button>
            </div>
            {stale && (
              <div
                className="notice form-stack"
                role="alert"
                tabIndex={-1}
                ref={recoveryNotice}
              >
                <p>
                  {latest
                    ? tr(
                        "This fixture has changed. Your unsaved draft is still shown. Copy any changes you want to keep before loading the latest version; loading it will discard this draft.",
                      )
                    : tr("This fixture is no longer available.")}
                </p>
                {latest && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={readOnly || !data.canManage}
                    onClick={() => setEditing(latest)}
                  >
                    {tr("Load latest fixture version")}
                  </button>
                )}
              </div>
            )}
            <StaffReadOnlyContext
              key={
                editing && editing !== "new"
                  ? `${editing.id}-${editing.version}-${editing.assignmentRevision}`
                  : "new"
              }
              value={readOnly || !data.canManage || stale}
            >
              {editing && editing !== "new" && (
                <div className="form-stack">
                  <p className="small muted">
                    {editing.publishedAt
                      ? tr(
                          "Saved changes update this public fixture immediately.",
                        )
                      : tr("Changes are private until publication.")}
                  </p>
                  <ConfirmMutation
                    label={
                      editing.publishedAt
                        ? tr("Unpublish fixture")
                        : tr("Publish fixture")
                    }
                    title={
                      editing.publishedAt
                        ? tr("Withdraw fixture publication?")
                        : tr("Publish fixture schedule?")
                    }
                    description={tr(
                      "This controls fixture visibility. Scores still require a separately approved and published result.",
                    )}
                    url={`/api/admin/tournaments/${slug}/matches`}
                    payload={{
                      action: "publish",
                      fixtureId: editing.id,
                      expectedVersion: editing.version,
                      published: !editing.publishedAt,
                      confirmed: true,
                    }}
                    onSuccess={() => {
                      editor.current?.close();
                      setEditing(null);
                    }}
                  />
                </div>
              )}
              {editing && (
                <FixtureForm
                  key={
                    editing === "new"
                      ? "new"
                      : `${editing.id}-${editing.version}`
                  }
                  slug={slug}
                  data={data}
                  fixture={editing === "new" ? undefined : editing}
                  onSaved={() => {
                    editor.current?.close();
                    setEditing(null);
                  }}
                />
              )}
              {editing && editing !== "new" && (
                <div className="fixture-delete-section">
                  <ConfirmMutation
                    label={tr("Delete fixture")}
                    className="secondary destructive-action"
                    title={tr("Delete fixture {label}?", {
                      label: editing.label,
                    })}
                    description={tr(
                      "Delete an incorrect, unused setup fixture and its referee assignments. Match records, results and bracket dependencies cannot be deleted. This is separate from cancelling a match.",
                    )}
                    disabled={Boolean(editing.publishedAt)}
                    url={`/api/admin/tournaments/${slug}/matches`}
                    payload={{
                      action: "delete",
                      fixtureId: editing.id,
                      expectedVersion: editing.version,
                      expectedAssignmentRevision: editing.assignmentRevision,
                      confirmed: true,
                    }}
                    onSuccess={() => {
                      editor.current?.close();
                      setEditing(null);
                      setNotice(tr("Fixture deleted."));
                      requestAnimationFrame(() =>
                        createButton.current?.focus(),
                      );
                    }}
                  >
                    <dl className="detail-list">
                      <div>
                        <dt>{tr("Round")}</dt>
                        <dd>
                          {
                            data.rounds.find(
                              (r) => r.round.id === editing.roundId,
                            )?.round.name
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>{tr("Teams")}</dt>
                        <dd>
                          {fixtureSlot(data, editing, "home").label} ·{" "}
                          {fixtureSlot(data, editing, "away").label}
                        </dd>
                      </div>
                    </dl>
                  </ConfirmMutation>
                  <ForceFixtureDelete
                    key={editing.id}
                    slug={slug}
                    fixtureId={editing.id}
                    onDeleted={() => {
                      editor.current?.close();
                      setEditing(null);
                      setNotice(tr("Fixture deleted."));
                      requestAnimationFrame(() =>
                        createButton.current?.focus(),
                      );
                    }}
                  />
                  {editing.publishedAt && (
                    <p className="muted small">
                      {tr(
                        "Unpublish this fixture before deleting it from the schedule.",
                      )}
                    </p>
                  )}
                </div>
              )}
            </StaffReadOnlyContext>
          </dialog>
        </>
      )}
    </div>
  );
}
