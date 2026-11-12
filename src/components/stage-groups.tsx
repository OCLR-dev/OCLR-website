"use client";
import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import { useAppTranslations } from "@/i18n/shared";
import { maxStageGroups } from "@/lib/competition-model";
import type { FixtureWorkspace } from "@/lib/fixture-reads";
import { ReadOnlyFields, useStaffReadOnly } from "./staff-read-only";
import { ConfirmMutation } from "./confirm-mutation";
import { TeamAvatar } from "./team-avatar";
import { PublicationSwitch } from "./publication-switch";

type Group = { key?: string; name: string; teamIds: string[] };
type Team = FixtureWorkspace["teams"][number] & { avatarKey?: string | null };
type Destination = number | "unassigned";
function groupLetter(index: number): string {
  return index < 26
    ? String.fromCharCode(65 + index)
    : groupLetter(Math.floor(index / 26) - 1) + groupLetter(index % 26);
}
export function StageGroups({
  slug,
  data,
  stage,
}: {
  slug: string;
  data: { teams: Team[] };
  stage: FixtureWorkspace["stages"][number];
}) {
  const tr = useAppTranslations();
  const readOnly = useStaffReadOnly();
  const id = useId();
  const [groups, setGroups] = useState<Group[]>(
    stage.groupConfiguration?.groups ?? [],
  );
  const [count, setCount] = useState(
    stage.groupConfiguration &&
      stage.groupConfiguration.groups.length <= maxStageGroups
      ? stage.groupConfiguration.groups.length.toString()
      : "",
  );
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [published, setPublished] = useState(Boolean(stage.groupsPublishedAt));
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Destination | null>(null);
  const dragged = useRef<string | null>(null);
  const [notice, setNotice] = useState("");
  const unassigned = data.teams.filter(
    (t) => !groups.some((g) => g.teamIds.includes(t.id)),
  );
  const changed =
    JSON.stringify(groups) !==
      JSON.stringify(stage.groupConfiguration?.groups ?? []) ||
    published !== Boolean(stage.groupsPublishedAt);
  const unappliedCount = count !== "" && Number(count) !== groups.length;
  const invalid =
    groups.length > maxStageGroups ||
    groups.some(
      (g) => !g.name.trim() || g.teamIds.length < 2 || g.teamIds.length > 128,
    ) ||
    (published && !groups.length);
  const destinationName = (target: Destination) =>
    target === "unassigned"
      ? tr("Unassigned teams")
      : groups[target]?.name || groupLetter(target);
  function clearDrag() {
    dragged.current = null;
    setDragging(null);
    setOver(null);
  }
  function move(teamId: string, target: Destination) {
    if (
      readOnly ||
      !data.teams.some((t) => t.id === teamId) ||
      (target !== "unassigned" && !groups[target])
    )
      return;
    const current = groups.findIndex((g) => g.teamIds.includes(teamId));
    if (current === (target === "unassigned" ? -1 : target)) return;
    setGroups((old) =>
      old.map((g, index) => ({
        ...g,
        teamIds:
          index === target
            ? [...g.teamIds.filter((value) => value !== teamId), teamId]
            : g.teamIds.filter((value) => value !== teamId),
      })),
    );
    setNotice(
      tr("{team} moved to {group}. Save to apply.", {
        team: data.teams.find((t) => t.id === teamId)!.name,
        group: destinationName(target),
      }),
    );
    setSelected(null);
  }
  function resize(nextCount: number) {
    if (
      readOnly ||
      !Number.isInteger(nextCount) ||
      nextCount < 0 ||
      nextCount > maxStageGroups
    )
      return;
    setGroups((old) =>
      Array.from(
        { length: nextCount },
        (_, index) => old[index] ?? { name: groupLetter(index), teamIds: [] },
      ),
    );
    setPendingCount(null);
    setSelected(null);
    clearDrag();
  }
  function generate() {
    if (readOnly || count === "") return;
    const next = Number(count);
    if (groups.slice(next).some((g) => g.teamIds.length)) setPendingCount(next);
    else resize(next);
  }
  function pointerStart(
    event: PointerEvent<HTMLButtonElement>,
    teamId: string,
  ) {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    dragged.current = teamId;
    setDragging(teamId);
    setSelected(teamId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerTarget(
    event: PointerEvent<HTMLButtonElement>,
  ): Destination | null {
    const element = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-group-drop]");
    // A second stage on the page is a separate assignment workspace.
    if (!element || element.dataset.groupBoard !== id) return null;
    return element.dataset.groupDrop === "unassigned"
      ? "unassigned"
      : Number(element.dataset.groupDrop);
  }
  function pointerEnd(event: PointerEvent<HTMLButtonElement>) {
    const target = pointerTarget(event);
    if (target !== null && dragged.current) move(dragged.current, target);
    clearDrag();
  }
  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const value = event.currentTarget.dataset.groupDrop;
    const target = value === "unassigned" ? "unassigned" : Number(value);
    try {
      const source = JSON.parse(
        event.dataTransfer.getData("application/x-oclr-group-team"),
      );
      if (source.board === id && typeof source.teamId === "string")
        move(source.teamId, target);
    } catch {
      // Ignore unrelated drags; the normal team picker remains available.
    }
    setDragging(null);
    setOver(null);
  }
  function targetProps(target: Destination) {
    return {
      "data-group-drop": String(target),
      "data-group-board": id,
      "data-drag-over": over === target || undefined,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (
          !readOnly &&
          event.dataTransfer.types.includes("application/x-oclr-group-team")
        ) {
          event.preventDefault();
          setOver(target);
        }
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOver(null);
      },
      onDrop: drop,
    };
  }
  function card(team: Team, target: Destination) {
    return (
      <li
        key={team.id}
        className="group-team-card"
        data-selected={selected === team.id || undefined}
        data-dragging={dragging === team.id || undefined}
        draggable={!readOnly}
        onDragStart={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }
          setDragging(team.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "application/x-oclr-group-team",
            JSON.stringify({ board: id, teamId: team.id }),
          );
        }}
        onDragEnd={clearDrag}
      >
        <button
          type="button"
          className="group-team-select"
          draggable={!readOnly}
          aria-label={tr("Select team {name}", { name: team.name })}
          aria-pressed={selected === team.id}
          onClick={() =>
            !readOnly && setSelected(selected === team.id ? null : team.id)
          }
        >
          <TeamAvatar team={team} />
          <span>
            <strong>{team.name}</strong>
            {team.unpublished && <small>{tr("Unpublished")}</small>}
          </span>
        </button>
        <button
          type="button"
          className="secondary group-team-grip"
          aria-label={tr("Drag team {name}", { name: team.name })}
          aria-describedby={`${id}-help`}
          onPointerDown={(event) => pointerStart(event, team.id)}
          onPointerMove={(event) => {
            if (dragged.current) setOver(pointerTarget(event));
          }}
          onPointerUp={pointerEnd}
          onPointerCancel={clearDrag}
          onClick={(event) => {
            if (event.detail === 0 && !readOnly) setSelected(team.id);
          }}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        {target !== "unassigned" && (
          <button
            type="button"
            className="secondary group-team-return"
            aria-label={tr("Return {name} to unassigned", { name: team.name })}
            onClick={() => move(team.id, "unassigned")}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </li>
    );
  }
  return (
    <ReadOnlyFields>
      <section className="form-stack team-group-manager group-assignment">
        <PublicationSwitch
          label={tr("Publish approved group assignments")}
          checked={published}
          onChange={setPublished}
        />
        <p id={`${id}-help`} className="small muted">
          {tr(
            "Choose the number of groups, then drag teams into a group or use its team selector.",
          )}
        </p>
        <div className="group-count-controls">
          <label className="field">
            <span>{tr("Group count")}</span>
            <select
              aria-label={tr("Group count")}
              value={count}
              onChange={(event) => {
                setCount(event.target.value);
                setPendingCount(null);
              }}
            >
              <option value="">{tr("Choose group count")}</option>
              <option value="0">{tr("No groups")}</option>
              {Array.from({ length: maxStageGroups }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={count === "" || !unappliedCount}
            onClick={generate}
          >
            {groups.length ? tr("Apply group count") : tr("Generate groups")}
          </button>
          <span className="small muted">
            {changed ? tr("Unsaved changes") : tr("Saved assignments")}
          </span>
        </div>
        {pendingCount !== null && (
          <div className="notice form-stack group-resize-confirm" role="alert">
            <p>
              {tr(
                "Teams in removed groups will return to Unassigned. Existing saved assignments stay unchanged until you save.",
              )}
            </p>
            <div className="actions">
              <button type="button" onClick={() => resize(pendingCount)}>
                {tr("Apply group count")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPendingCount(null);
                  setCount(String(groups.length));
                }}
              >
                {tr("Cancel")}
              </button>
            </div>
          </div>
        )}
        {unappliedCount && (
          <p className="small muted">
            {tr("Apply the group count before saving.")}
          </p>
        )}
        <section
          className="group-unassigned"
          aria-label={tr("Unassigned teams")}
          {...targetProps("unassigned")}
        >
          <div className="group-card-heading">
            <h3>{tr("Unassigned teams")}</h3>
            <span className="badge">{unassigned.length}</span>
          </div>
          {unassigned.length ? (
            <ul className="group-team-list group-team-pool">
              {unassigned.map((t) => card(t, "unassigned"))}
            </ul>
          ) : (
            <p className="small muted">{tr("None")}</p>
          )}
          {selected && groups.some((g) => g.teamIds.includes(selected)) && (
            <button
              type="button"
              className="secondary"
              onClick={() => move(selected, "unassigned")}
            >
              {tr("Move selected team here")}
            </button>
          )}
        </section>
        {selected && (
          <div className="group-selected small" role="status">
            <span>
              {tr("Select a team card, then choose where to move it.")}{" "}
              <strong>{data.teams.find((t) => t.id === selected)?.name}</strong>
            </span>
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected(null)}
            >
              {tr("Clear selection")}
            </button>
          </div>
        )}
        <div className="group-assignment-grid">
          {groups.map((group, index) => (
            <article
              key={group.key ?? index}
              className="group-assignment-card"
              aria-label={tr("Group {name}", {
                name: group.name || groupLetter(index),
              })}
              {...targetProps(index)}
            >
              <div className="group-card-heading">
                <h3>
                  {tr("Group {name}", {
                    name: group.name || groupLetter(index),
                  })}
                </h3>
                <span className="badge">{group.teamIds.length}</span>
              </div>
              <label className="field">
                <span>
                  {tr("Group name ")}
                  {index + 1}
                </span>
                <input
                  value={group.name}
                  maxLength={80}
                  required
                  aria-invalid={!group.name.trim()}
                  onChange={(event) =>
                    setGroups((old) =>
                      old.map((g, i) =>
                        i === index ? { ...g, name: event.target.value } : g,
                      ),
                    )
                  }
                />
              </label>
              {!group.name.trim() && (
                <p className="small error-text">
                  {tr("Group name is required.")}
                </p>
              )}
              <ul className="group-team-list">
                {group.teamIds
                  .map((teamId) => data.teams.find((t) => t.id === teamId))
                  .filter((t): t is Team => Boolean(t))
                  .map((t) => card(t, index))}
              </ul>
              {!group.teamIds.length && (
                <p className="group-drop-hint small muted">
                  {tr("Drop teams here")}
                </p>
              )}
              {selected && !group.teamIds.includes(selected) && (
                <button
                  type="button"
                  className="secondary group-assign-selected"
                  onClick={() => move(selected, index)}
                >
                  {tr("Move selected team here")}
                </button>
              )}
              <label className="field group-team-picker">
                <span>
                  {tr("Add team to {group}", {
                    group: group.name || groupLetter(index),
                  })}
                </span>
                <select
                  aria-label={tr("Add team to {group}", {
                    group: group.name || groupLetter(index),
                  })}
                  value=""
                  onChange={(event) => {
                    if (event.target.value) move(event.target.value, index);
                  }}
                >
                  <option value="">{tr("Choose a team")}</option>
                  {data.teams
                    .filter((t) => !group.teamIds.includes(t.id))
                    .map((t) => {
                      const other = groups.find((g) =>
                        g.teamIds.includes(t.id),
                      );
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.unpublished ? ` · ${tr("Unpublished")}` : ""}
                          {other ? ` · ${other.name}` : ""}
                        </option>
                      );
                    })}
                </select>
              </label>
            </article>
          ))}
        </div>
        {groups.length > 0 && (
          <p className="small muted">
            {tr("At least two teams per group are required before saving.")}
          </p>
        )}
        <p className="small muted group-assignment-status" role="status">
          {notice}
        </p>
        <div className="group-save-controls">
          <ConfirmMutation
            loadingFeedback="button"
            disabled={!changed || invalid || unappliedCount}
            label={tr("Save group assignments")}
            title={tr("Save approved Group Stage configuration?")}
            description={tr(
              "This updates the group membership used by public standings when published. Scores remain governed by reviewed results and the configured round ranking rules.",
            )}
            url={`/api/admin/tournaments/${slug}/matches`}
            payload={{
              action: "stage_groups",
              stageId: stage.id,
              expectedVersion: stage.version,
              configuration: groups.length ? { groups } : null,
              published,
              confirmed: true,
            }}
          />
        </div>
      </section>
    </ReadOnlyFields>
  );
}
