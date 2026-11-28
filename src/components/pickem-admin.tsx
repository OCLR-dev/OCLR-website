"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import { formatDate } from "@/lib/editions";
import { pickemStatusText, pickemVoidText } from "@/lib/pickem-labels";
import type { pickemAdminRead } from "@/lib/pickem";
import { ZonedDateInput } from "./zoned-date-input";
import styles from "./pickem.module.css";

type AdminData = Awaited<ReturnType<typeof pickemAdminRead>>;
type AdminFixture = AdminData["rows"][number];
type Action = "open" | "tighten" | "close" | "void";

export function PickemAdmin({ slug, data }: { slug: string; data: AdminData }) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [round, setRound] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const rounds = new Map(data.rows.map((row) => [row.roundId, row.round]));

  const rows = data.rows.filter((row) => !round || row.roundId === round);

  async function toggle() {
    if (
      pending ||
      !window.confirm(
        data.settings.enabled
          ? tr("Disable match predictions for this season?")
          : tr("Enable match predictions for this season?"),
      )
    )
      return;
    setPending(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/admin/tournaments/${slug}/pickem/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: !data.settings.enabled,
            expectedVersion: data.settings.version,
          }),
        },
      );
      if (!response.ok) throw new Error("settings");
    } catch {
      setError(true);
    } finally {
      router.refresh();
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.adminSettings}>
        <div>
          <h2>{tr("Prediction settings")}</h2>
          <span
            className={styles.status}
            data-status={data.settings.enabled ? "open" : undefined}
          >
            {data.settings.enabled
              ? tr("Match predictions enabled")
              : tr("Match predictions disabled")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={pending || (!data.published && !data.settings.enabled)}
          aria-busy={pending}
          className={data.settings.enabled ? "secondary" : undefined}
        >
          {data.settings.enabled
            ? tr("Disable match predictions")
            : tr("Enable match predictions")}
        </button>
        {!data.published && (
          <p>{tr("Publish the tournament before opening predictions.")}</p>
        )}
        {error && (
          <p role="alert" className={styles.problem}>
            {tr("Could not save the setting. Try again.")}
          </p>
        )}
      </section>
      <label className={styles.adminFilter}>
        <span>{tr("Rounds")}</span>
        <select
          value={round}
          onChange={(event) => setRound(event.target.value)}
        >
          <option value="">{tr("All")}</option>
          {[...rounds].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {!rows.length && (
        <p className={styles.muted}>{tr("No matches match these filters.")}</p>
      )}
      <ul className={styles.adminRows}>
        {rows.map((row) => (
          <li key={row.id}>
            <AdminRow
              key={`${row.fixtureVersion}-${row.window?.id}-${row.window?.version}`}
              slug={slug}
              row={row}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminRow({ slug, row }: { slug: string; row: AdminFixture }) {
  const tr = useAppTranslations();
  const router = useRouter();
  const active = row.window;
  const [closesAt, setClosesAt] = useState(active?.closesAt ?? row.scheduledAt);
  const [valid, setValid] = useState(false);
  const deadline = Date.parse(closesAt ?? "");
  const limit = Date.parse(active?.closesAt ?? row.scheduledAt ?? "");
  const canSaveDeadline =
    valid && (active ? deadline < limit : deadline <= limit);
  const [scoreEnabled, setScoreEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disabledReason =
    row.reason === "unpublished"
      ? tr("Publish the teams and match first.")
      : row.reason === "schedule"
        ? tr("Confirm the match time first.")
        : row.reason === "started"
          ? tr("This match has already started.")
          : row.reason === "rules"
            ? tr("Configure the round scoring rules first.")
            : null;
  const series = row.rules?.series;

  async function save(action: Action) {
    if (pending) return;
    if (
      (action === "close" || action === "void") &&
      !window.confirm(
        action === "close"
          ? tr("Close predictions for this match now?")
          : tr("Void predictions for this match?"),
      )
    )
      return;
    setPending(true);
    setError("");
    const body =
      action === "open"
        ? { action, closesAt, scoreEnabled, fixtureVersion: row.fixtureVersion }
        : {
            action,
            ...(action === "tighten" ? { closesAt } : {}),
            windowId: active?.id,
            expectedVersion: active?.version,
          };
    try {
      const result = await fetch(
        `/api/admin/tournaments/${slug}/pickem/fixtures/${row.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!result.ok) {
        setError(
          result.status === 409
            ? tr("This match changed. Refresh and try again.")
            : tr("Could not save the setting. Check the deadline."),
        );
        return;
      }
      router.refresh();
    } catch {
      setError(tr("Could not save the setting. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <details className={styles.adminRow}>
      <summary>
        <span className={styles.adminMatch}>
          <strong>{row.label}</strong>
          <span>
            {row.round} ·{" "}
            {row.home && row.away
              ? `${row.home} vs ${row.away}`
              : tr("To be announced")}
          </span>
        </span>
        <span className={styles.adminMatchMeta}>
          {row.scheduledAt && (
            <time dateTime={row.scheduledAt}>
              {formatDate(row.scheduledAt, row.timeZone, tr.locale)}
            </time>
          )}
          {active?.status && (
            <span className={styles.status} data-status={active.status}>
              {pickemStatusText(tr, active.status)}
            </span>
          )}
        </span>
      </summary>
      <div className={styles.adminRowBody}>
        {series && (
          <p>
            {series.type === "first_to"
              ? tr("First to {wins} map wins", { wins: series.wins })
              : tr("{count} fixed maps", { count: series.count })}
          </p>
        )}
        {active && (
          <p>
            {tr("Pick deadline")} ·{" "}
            {formatDate(active.closesAt, row.timeZone, tr.locale)} ·{" "}
            {active.scoreEnabled
              ? tr("Score picks enabled")
              : tr("Results only")}
          </p>
        )}
        {active?.count !== null && active?.count !== undefined && (
          <p>
            {tr("Total predictions")} · {active.count}
          </p>
        )}
        {active?.result && (
          <p>
            {tr("Official result")} ·{" "}
            {active.result.outcomeKey === "draw"
              ? tr("Draw")
              : active.result.outcomeKey === "home"
                ? row.home
                : row.away}
          </p>
        )}
        {!active && disabledReason && <p>{disabledReason}</p>}
        {row.lastVoid && !active && <p>{pickemVoidText(tr, row.lastVoid)}</p>}
        {((!active && !disabledReason) || active?.status === "open") && (
          <>
            <ZonedDateInput
              label={tr("Pick deadline")}
              value={closesAt}
              timeZone={row.timeZone}
              onChange={setClosesAt}
              onValidityChange={setValid}
            />
            {valid && deadline > limit && (
              <p role="alert" className={styles.problem}>
                {active
                  ? tr("Choose a time earlier than the current deadline.")
                  : tr("Choose a deadline at or before the match start.")}
              </p>
            )}
          </>
        )}
        {!active && !disabledReason && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={scoreEnabled}
              onChange={(event) => setScoreEnabled(event.target.checked)}
            />{" "}
            {tr("Allow score predictions")}
          </label>
        )}
        <div className={styles.adminActions}>
          {!active && !disabledReason && (
            <button
              type="button"
              disabled={pending || !canSaveDeadline}
              onClick={() => void save("open")}
            >
              {tr("Open predictions")}
            </button>
          )}
          {active?.status === "open" && (
            <>
              <button
                type="button"
                disabled={pending || !canSaveDeadline}
                onClick={() => void save("tighten")}
              >
                {tr("Set earlier deadline")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void save("close")}
              >
                {tr("Close now")}
              </button>
            </>
          )}
          {active && (
            <button
              type="button"
              disabled={pending}
              className="secondary"
              onClick={() => void save("void")}
            >
              {tr("Void predictions")}
            </button>
          )}
          <Link
            className="text-link"
            href={`/admin/tournaments/${slug}/matches/${row.id}`}
          >
            {tr("Fixtures & results")}
          </Link>
        </div>
        {error && (
          <p role="alert" className={styles.problem}>
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
