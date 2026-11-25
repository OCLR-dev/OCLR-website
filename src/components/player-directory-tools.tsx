"use client";

import { InfoNote } from "@/components/info-note";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import {
  directoryErrors,
  directoryKeys,
  directoryMetrics,
  directoryOptions,
  directorySorts,
  directoryState,
  selectDirectoryPlayers,
  type DirectoryPlayer,
  type DirectoryRangeKey,
} from "@/lib/player-directory";
import styles from "./player-directory-tools.module.css";

const changeEvent = "oclr-player-directory-change";
const filterKeys = directoryKeys.filter((key) => key !== "group");
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
  otrLoading = false,
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
  const errors = directoryErrors(state);
  const waitingForRating =
    otrLoading &&
    Boolean(state.otrMin || state.otrMax || state.sort.startsWith("otr-"));
  function update(values: Partial<typeof state>, reset = false) {
    const next = new URLSearchParams(query);
    // Retain edition/preview context and unrelated legacy display parameters.
    if (reset) {
      filterKeys.forEach((key) => next.delete(key));
      if (errors.includes("filter")) next.delete("group");
    }
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("ranked");
    next.delete("hasPp");
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
    rows: waitingForRating ? [] : selectDirectoryPlayers(players, state),
    options: directoryOptions(players),
    errors,
    total: new Set(players.map((p) => p.id)).size,
    waitingForRating,
  };
}

export function PlayerDirectoryTools({
  directory,
  grouping = false,
  actions,
}: {
  directory: ReturnType<typeof usePlayerDirectory>;
  grouping?: boolean;
  actions?: ReactNode;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const { state, update, rows, total, options, errors, waitingForRating } =
    directory;
  const teamLabels = new Map(options.teams.map((team) => [team.id, team.name]));
  if (options.freeAgent || state.team === "free_agent")
    teamLabels.set("free_agent", tr("Free agent"));
  if (state.team && !teamLabels.has(state.team))
    teamLabels.set(state.team, state.team);
  const roles = new Set(options.roles);
  if (state.role) roles.add(state.role);
  const labels = {
    default: tr("Default order"),
    "name-asc": tr("Username A–Z"),
    "name-desc": tr("Username Z–A"),
    "rank-asc": tr("Global rank: best first"),
    "rank-desc": tr("Global rank: reverse order"),
    "otr-desc": tr("o!TR: highest first"),
    "otr-asc": tr("o!TR: lowest first"),
    "sip-desc": tr("SIP: highest first"),
    "sip-asc": tr("SIP: lowest first"),
    "etx-desc": tr("ETX: highest first"),
    "etx-asc": tr("ETX: lowest first"),
  };
  const rangeLabels = {
    rankMin: tr("Global rank minimum (number)"),
    rankMax: tr("Global rank maximum (number)"),
    ppMin: tr("PP minimum"),
    ppMax: tr("PP maximum"),
    otrMin: tr("o!TR minimum"),
    otrMax: tr("o!TR maximum"),
    sipMin: tr("SIP minimum"),
    sipMax: tr("SIP maximum"),
    etxMin: tr("ETX minimum"),
    etxMax: tr("ETX maximum"),
  };
  const metricLabels = {
    rank: tr("Global rank"),
    pp: "PP",
    otr: "o!TR",
    sip: "SIP",
    etx: "ETX",
  };
  const roleLabels: Record<string, string> = {
    player: tr("Player"),
    captain: "Captain",
    coach: tr("Coach"),
    free_agent: tr("Free agent"),
  };
  const active = filterKeys.filter(
    (key) => state[key] && !(key === "sort" && state.sort === "default"),
  );
  const canClear = active.length > 0 || errors.includes("filter");
  const rangeActive = Object.keys(rangeLabels).filter(
    (key) => state[key as DirectoryRangeKey],
  ).length;
  const revealFilters = errors.length > 0 || rangeActive > 0;
  const [expanded, setExpanded] = useState(revealFilters);
  const [advancedOpen, setAdvancedOpen] = useState(revealFilters);
  const [editingMetric, setEditingMetric] = useState<
    (typeof directoryMetrics)[number] | null
  >(null);
  const visibleMetrics = directoryMetrics.filter(
    (metric) =>
      options[metric] ||
      state[`${metric}Min`] ||
      state[`${metric}Max`] ||
      metric === editingMetric,
  );
  const reset = () => update({}, true);
  const roleLabel = (role: string) =>
    Object.hasOwn(roleLabels, role) ? roleLabels[role] : role;
  const field = (
    metric: (typeof directoryMetrics)[number],
    bound: "Min" | "Max",
  ) => (
    <label className="field">
      <span>{rangeLabels[`${metric}${bound}`]}</span>
      <input
        inputMode={
          metric === "sip"
            ? undefined
            : metric === "rank"
              ? "numeric"
              : "decimal"
        }
        value={state[`${metric}${bound}`]}
        onChange={(e) => update({ [`${metric}${bound}`]: e.target.value })}
        aria-invalid={errors.includes(metric) || undefined}
        aria-describedby={errors.length ? `${id}-errors` : undefined}
      />
    </label>
  );
  return (
    <div className={styles.tools}>
      <div className={styles.controls}>
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
              .filter((sort) => {
                const metric = directoryMetrics.find((key) =>
                  sort.startsWith(`${key}-`),
                );
                return !metric || options[metric] || sort === state.sort;
              })
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
          aria-controls={
            visibleMetrics.length > 0
              ? `${id}-filters ${id}-advanced`
              : `${id}-filters`
          }
          onClick={() => setExpanded(!expanded)}
        >
          {tr("Filters")} ({active.length})
        </button>
        <div
          id={`${id}-filters`}
          className={`${styles.filters} ${expanded ? styles.expanded : ""}`}
        >
          {teamLabels.size > 0 && (
            <label className="field">
              <span>{tr("Team")}</span>
              <select
                aria-label={tr("Team")}
                value={state.team}
                onChange={(e) => update({ team: e.target.value })}
              >
                <option value="">{tr("All teams")}</option>
                {[...teamLabels].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(roles.size > 1 || state.role !== "") && (
            <label className="field">
              <span>{tr("Role")}</span>
              <select
                aria-label={tr("Role")}
                value={state.role}
                onChange={(e) => update({ role: e.target.value })}
              >
                <option value="">{tr("All roles")}</option>
                {[...roles].map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <div className={styles.secondary}>
        {visibleMetrics.length > 0 && (
          <details
            id={`${id}-advanced`}
            className={`${styles.advanced} ${expanded ? styles.expanded : ""}`}
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary>
              <svg
                className={styles.filterIcon}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6" />
              </svg>
              <span>{tr("Advanced filters")}</span>
              {rangeActive > 0 && (
                <span className={styles.count}>{rangeActive}</span>
              )}
              <svg
                className={styles.chevron}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className={styles.ranges}>
              {visibleMetrics.map((metric) => (
                <fieldset
                  key={metric}
                  className={styles.rangeGroup}
                  onFocus={() => setEditingMetric(metric)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      setEditingMetric(null);
                  }}
                >
                  <legend>{metricLabels[metric]}</legend>
                  <div className={styles.rangeFields}>
                    {field(metric, "Min")}
                    <span className={styles.rangeSeparator} aria-hidden="true">
                      –
                    </span>
                    {field(metric, "Max")}
                  </div>
                </fieldset>
              ))}
              <InfoNote>
                <p className="muted small">
                  {tr(
                    "Ranges include both endpoints. A smaller global rank number is better.",
                  )}
                </p>
              </InfoNote>
            </div>
          </details>
        )}
        <div className={styles.status}>
          <p
            className="muted"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {waitingForRating
              ? tr("Loading o!TR ratings…")
              : `${rows.length} / ${total} ${tr("Players")}`}
          </p>
          {canClear && (
            <button type="button" onClick={reset}>
              {tr("Clear filters")}
            </button>
          )}
        </div>
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
          {errors.includes("otr") && (
            <p>
              {tr(
                "Enter nonnegative o!TR numbers, with minimum no greater than maximum.",
              )}
            </p>
          )}
          {(errors.includes("sip") || errors.includes("etx")) && (
            <p>
              {tr(
                "Enter valid rating bounds, with minimum no greater than maximum.",
              )}
            </p>
          )}
          {(errors.includes("sort") || errors.includes("filter")) && (
            <p>{tr("Choose valid player filters and sorting.")}</p>
          )}
        </div>
      )}
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
                    sort: tr("Sort players"),
                    ...rangeLabels,
                  }[key]
                }
                {`: ${key === "sort" ? (labels[state.sort as keyof typeof labels] ?? state.sort) : key === "team" ? teamLabels.get(state.team) : key === "role" ? roleLabel(state.role) : state[key]}`}{" "}
                <span aria-hidden="true">×</span>
                <span className="sr-only"> {tr("Remove filter")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && !waitingForRating && (
        <div className="notice">
          <p>
            {total === 0
              ? tr("No public players are available for this season yet.")
              : tr("No players match your search.")}
          </p>
          {canClear && (
            <button type="button" onClick={reset}>
              {tr("Clear filters")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
