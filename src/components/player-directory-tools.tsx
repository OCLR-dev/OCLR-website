"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import {
  directoryErrors,
  directoryKeys,
  directoryOptions,
  directorySorts,
  directoryState,
  selectDirectoryPlayers,
  type DirectoryPlayer,
} from "@/lib/player-directory";
import styles from "./player-directory-tools.module.css";

const changeEvent = "oclr-player-directory-change";
function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(changeEvent, callback);
  };
}
const browserQuery = () => window.location.search.slice(1);

export function usePlayerDirectory<T extends DirectoryPlayer>(
  players: T[],
  grouped = false,
) {
  const params = useSearchParams();
  // History updates are transitions in Next. Subscribe synchronously as well so
  // controlled checkboxes do not briefly revert while that transition commits.
  const query = useSyncExternalStore(
    subscribe,
    browserQuery,
    () => params?.toString() ?? "",
  );
  const state = directoryState(new URLSearchParams(query), grouped);
  function update(values: Partial<typeof state>, reset = false) {
    const next = new URLSearchParams(query);
    // Retain edition/preview context and unrelated legacy display parameters.
    if (reset) directoryKeys.forEach((key) => next.delete(key));
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const nextQuery = next.toString();
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`,
    );
    window.dispatchEvent(new Event(changeEvent));
  }
  return {
    state,
    update,
    rows: selectDirectoryPlayers(players, state),
    options: directoryOptions(players),
    errors: directoryErrors(state),
    total: new Set(players.map((p) => p.id)).size,
  };
}

export function PlayerDirectoryTools({
  directory,
  grouping = false,
}: {
  directory: ReturnType<typeof usePlayerDirectory>;
  grouping?: boolean;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const { state, update, rows, total, options, errors } = directory;
  const labels = {
    default: tr("Default order"),
    "name-asc": tr("Username A–Z"),
    "name-desc": tr("Username Z–A"),
    "rank-asc": tr("Global rank: best first"),
    "rank-desc": tr("Global rank: reverse order"),
    "pp-desc": tr("PP: high to low"),
    "pp-asc": tr("PP: low to high"),
  };
  const roleLabels: Record<string, string> = {
    player: tr("Player"),
    captain: "Captain",
    coach: tr("Coach"),
    free_agent: tr("Free agent"),
  };
  const active = directoryKeys.filter(
    (key) =>
      !["group"].includes(key) &&
      state[key] &&
      !(key === "sort" && state.sort === "default"),
  );
  const reset = () => update({}, true);
  const field = (
    key: "rankMin" | "rankMax" | "ppMin" | "ppMax",
    label: string,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode={key.startsWith("rank") ? "numeric" : "decimal"}
        value={state[key]}
        onChange={(e) => update({ [key]: e.target.value })}
        aria-invalid={
          errors.includes(key.startsWith("rank") ? "rank" : "pp") || undefined
        }
        aria-describedby={errors.length ? `${id}-errors` : undefined}
      />
    </label>
  );
  return (
    <div className={styles.tools}>
      <div className={styles.primary}>
        <form onSubmit={(e) => e.preventDefault()} className={styles.search}>
          <label className="field">
            <span>{tr("Search players")}</span>
            <input
              type="search"
              maxLength={200}
              value={state.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder={tr("Username, osu! ID or team")}
            />
          </label>
          <button type="submit">{tr("Search")}</button>
        </form>
        <label className="field">
          <span>{tr("Sort players")}</span>
          <select
            aria-label={tr("Sort players")}
            value={state.sort}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {directorySorts
              .filter(
                (sort) =>
                  (!sort.startsWith("rank") || options.rank) &&
                  (!sort.startsWith("pp") || options.pp),
              )
              .map((sort) => (
                <option value={sort} key={sort}>
                  {labels[sort]}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls={`${id}-filters`}
          onClick={() => setExpanded(!expanded)}
        >
          {tr("Filters")} ({active.length})
        </button>
      </div>
      <div
        id={`${id}-filters`}
        className={`${styles.filters} ${expanded ? styles.expanded : ""}`}
      >
        {(options.teams.length > 0 || options.freeAgent) && (
          <label className="field">
            <span>{tr("Team")}</span>
            <select
              aria-label={tr("Team")}
              value={state.team}
              onChange={(e) => update({ team: e.target.value })}
            >
              <option value="">{tr("All teams")}</option>
              {options.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {options.freeAgent && (
                <option value="free_agent">{tr("Free agent")}</option>
              )}
            </select>
          </label>
        )}
        {options.roles.length > 1 && (
          <label className="field">
            <span>{tr("Role")}</span>
            <select
              aria-label={tr("Role")}
              value={state.role}
              onChange={(e) => update({ role: e.target.value })}
            >
              <option value="">{tr("All roles")}</option>
              {options.roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role] ?? role}
                </option>
              ))}
            </select>
          </label>
        )}
        {options.rank && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={state.ranked === "1"}
              onChange={(e) => update({ ranked: e.target.checked ? "1" : "" })}
            />
            {tr("Has global rank")}
          </label>
        )}
        {options.pp && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={state.hasPp === "1"}
              onChange={(e) => update({ hasPp: e.target.checked ? "1" : "" })}
            />
            {tr("Has PP")}
          </label>
        )}
        {(options.rank || options.pp) && (
          <details
            className={styles.advanced}
            open={errors.length > 0 || undefined}
          >
            <summary>{tr("Advanced filters")}</summary>
            <div className={styles.ranges}>
              {options.rank && (
                <>
                  {field("rankMin", tr("Global rank minimum (number)"))}
                  {field("rankMax", tr("Global rank maximum (number)"))}
                </>
              )}
              {options.pp && (
                <>
                  {field("ppMin", tr("PP minimum"))}
                  {field("ppMax", tr("PP maximum"))}
                </>
              )}
              <p className="muted small">
                {tr(
                  "Ranges include both endpoints. A smaller global rank number is better.",
                )}
              </p>
            </div>
          </details>
        )}
      </div>
      {grouping && (
        <div className="event-tabs">
          <button
            aria-pressed={state.group === "list"}
            onClick={() => update({ group: "list" })}
          >
            {tr("Registration list")}
          </button>
          <button
            aria-pressed={state.group === "team"}
            onClick={() => update({ group: "team" })}
          >
            {tr("Team groups")}
          </button>
        </div>
      )}
      {errors.length > 0 && (
        <div id={`${id}-errors`} role="alert">
          {errors.includes("rank") && (
            <p>
              {tr(
                "Enter whole global rank numbers of at least 1, with minimum no greater than maximum.",
              )}
            </p>
          )}
          {errors.includes("pp") && (
            <p>
              {tr(
                "Enter nonnegative PP numbers, with minimum no greater than maximum.",
              )}
            </p>
          )}
          {(errors.includes("sort") || errors.includes("filter")) && (
            <p>{tr("Choose valid player filters and sorting.")}</p>
          )}
        </div>
      )}
      <div className={styles.status}>
        <p
          className="muted"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {rows.length} / {total} {tr("Players")}
        </p>
        {active.length > 0 && (
          <button type="button" onClick={reset}>
            {tr("Clear filters")}
          </button>
        )}
      </div>
      {active.length > 0 && (
        <ul className={styles.applied} aria-label={tr("Applied filters")}>
          {active.map((key) => (
            <li key={key}>
              <button
                type="button"
                onClick={() =>
                  update({ [key]: key === "sort" ? "default" : "" })
                }
              >
                {
                  {
                    q: tr("Search players"),
                    team: tr("Team"),
                    role: tr("Role"),
                    ranked: tr("Has global rank"),
                    hasPp: tr("Has PP"),
                    sort: tr("Sort players"),
                    rankMin: tr("Global rank minimum (number)"),
                    rankMax: tr("Global rank maximum (number)"),
                    ppMin: tr("PP minimum"),
                    ppMax: tr("PP maximum"),
                    group: "",
                  }[key]
                }
                {!["ranked", "hasPp"].includes(key) &&
                  `: ${key === "sort" ? (labels[state.sort as keyof typeof labels] ?? state.sort) : key === "team" ? (options.teams.find((t) => t.id === state.team)?.name ?? (state.team === "free_agent" ? tr("Free agent") : state.team)) : key === "role" ? (roleLabels[state.role] ?? state.role) : state[key]}`}{" "}
                <span aria-hidden="true">×</span>
                <span className="sr-only"> {tr("Remove filter")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && (
        <div className="notice">
          <p>
            {total === 0
              ? tr("No public players are available for this season yet.")
              : tr("No players match your search.")}
          </p>
          {active.length > 0 && (
            <button type="button" onClick={reset}>
              {tr("Clear filters")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
