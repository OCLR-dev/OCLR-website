"use client";
import { useStaffReadOnly, MutationButton } from "./staff-read-only";

import { useAppTranslations } from "@/i18n/shared";

import { useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { usePendingRefresh } from "./use-pending-refresh";
import { LoadingRegion } from "./loading-region";
import { CaptainPlayerCard, type CaptainIdentity } from "./captain-player-card";
import type { captainSetup } from "@/lib/captains";
import { ConfirmMutation } from "./confirm-mutation";
type Setup = Awaited<ReturnType<typeof captainSetup>>;
export function CaptainManager({
  slug,
  setup,
  identities = {},
}: {
  slug: string;
  setup: Setup;
  identities?: Record<number, CaptainIdentity>;
}) {
  const readOnly = useStaffReadOnly();
  const tr = useAppTranslations();

  const [action, setAction] = useState("replace");
  const [userId, setUserId] = useState("");
  const [previousUserId, setPrevious] = useState("");
  const [order, setOrder] = useState(setup.captains.map((c) => c.userId));
  const [search, setSearch] = useState("");
  const [requestPending, setPending] = useState(false),
    [error, setError] = useState("");
  const [activeMutation, setActiveMutation] = useState<number | "order" | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const dragged = useRef<number | null>(null);
  const { refreshing, refresh } = usePendingRefresh();
  const [revision, setRevision] = useState(setup.version);
  const [published, setPublished] = useState(
    setup.captains.length > 0 && setup.captains.every((c) => c.published),
  );
  const [available, setAvailable] = useState(true);
  const [poolPublished, setPoolPublished] = useState(setup.poolPublished);
  const pending = requestPending || refreshing;
  // Sync authoritative order changes without losing conflict/error feedback.
  if (revision !== setup.version) {
    setRevision(setup.version);
    setOrder(setup.captains.map((c) => c.userId));
    setDragging(null);
    setPublished(
      setup.captains.length > 0 && setup.captains.every((c) => c.published),
    );
    setPoolPublished(setup.poolPublished);
  }
  const ordered = order.flatMap((id) =>
    setup.captains.filter((c) => c.userId === id),
  );
  const pool = setup.pool.filter((p) =>
    `${p.username} ${p.userId}`.toLowerCase().includes(search.toLowerCase()),
  );
  const changed = order.some((id, i) => id !== setup.captains[i]?.userId);
  const editable = !readOnly && !setup.locked && !pending;
  function move(id: number, target: number | undefined) {
    if (!editable) return;
    const destination =
      target === undefined ? order.length - 1 : order.indexOf(target);
    if (!order.includes(id) || destination < 0) return;
    const next = order.filter((value) => value !== id);
    next.splice(destination, 0, id);
    setOrder(next);
    setNotice("Captain order changed. Save the order to apply it.");
  }
  async function appoint(id: number) {
    if (!editable || !setup.pool.some((p) => p.userId === id)) return;
    if (changed) {
      setError(
        "Save or reset the captain order before appointing another captain.",
      );
      return;
    }
    await mutate({ action: "appoint", userId: id });
  }
  async function mutate(
    command:
      | { action: "appoint"; userId: number }
      | { action: "order"; userIds: number[] },
  ) {
    if (!editable) return;
    setActiveMutation(command.action === "appoint" ? command.userId : "order");
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/tournaments/${slug}/captains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          expectedVersion: setup.version,
          confirmed: true,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Captain setup could not be saved.");
      }
      setNotice(
        command.action === "appoint"
          ? "Captain appointed."
          : "Captain order saved.",
      );
      refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Appointment failed. Refresh to check the saved state.",
      );
      refresh();
    } finally {
      setPending(false);
    }
  }
  function drop(target?: number) {
    const id = dragged.current;
    dragged.current = null;
    setDragging(null);
    if (id === null || !editable) return;
    if (order.includes(id)) move(id, target);
    else void appoint(id);
  }
  function pointerStart(event: PointerEvent<HTMLElement>, id: number) {
    if (!editable || event.button !== 0) return;
    event.preventDefault();
    dragged.current = id;
    setDragging(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerEnd(event: PointerEvent<HTMLElement>) {
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const target = hit?.closest<HTMLElement>("[data-captain-id]");
    if (target) drop(Number(target.dataset.captainId));
    else if (hit?.closest("[data-captain-drop]")) drop();
    else {
      dragged.current = null;
      setDragging(null);
    }
  }
  const handle = (id: number) => (
    <span
      className="captain-drag-handle"
      aria-hidden="true"
      onPointerDown={(event) => pointerStart(event, id)}
      onPointerUp={pointerEnd}
      onPointerCancel={() => {
        dragged.current = null;
        setDragging(null);
      }}
    >
      ⠿
    </span>
  );

  const [unavailableExplanation, setExplanation] = useState("");
  const command =
    action === "publish"
      ? { action, published, poolPublished }
      : action === "lock"
        ? { action }
        : action === "replace"
          ? {
              action,
              userId: Number(userId),
              previousUserId: Number(previousUserId),
            }
          : action === "availability"
            ? {
                action,
                userId: Number(userId),
                available,
                ...(!available ? { unavailableExplanation } : {}),
              }
            : { action, userId: Number(userId) };
  return (
    <div className="stack">
      {pending && <LoadingRegion />}
      {error && (
        <p className="notice error-text" role="alert">
          {tr(error)}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
      <div className="captain-board">
        <section
          className="panel form-stack"
          aria-labelledby="captain-order-heading"
        >
          <div className="section-title">
            <h2 id="captain-order-heading">{tr("Captains")}</h2>
            {setup.captains.length > 0 && (
              <Link
                className="text-link small"
                href={`/admin/tournaments/${slug}/teams`}
              >
                {tr("Configure teams")}
              </Link>
            )}
          </div>
          <p className="muted small">
            {setup.locked
              ? tr(
                  "Captain setup is locked. Publication controls remain available below.",
                )
              : tr(
                  "Drag or appoint players; drag or use arrow buttons to reorder.",
                )}
          </p>
          <div
            className={`captain-drop-zone${dragging !== null ? " is-dragging" : ""}`}
            data-captain-drop
            role="group"
            aria-label={tr("Captain appointment area")}
            onDragOver={(event) => {
              if (editable) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop();
            }}
          >
            {ordered.length ? (
              <ol
                className="captain-order"
                aria-label={tr("Captain selection order")}
              >
                {ordered.map((c, index) => (
                  <li
                    key={c.userId}
                    data-captain-id={c.userId}
                    draggable={editable}
                    onDragStart={(event) => {
                      dragged.current = c.userId;
                      setDragging(c.userId);
                      event.dataTransfer.setData(
                        "text/plain",
                        String(c.userId),
                      );
                    }}
                    onDragEnd={() => {
                      dragged.current = null;
                      setDragging(null);
                    }}
                    onDragOver={(event) => {
                      if (editable) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      drop(c.userId);
                    }}
                  >
                    {editable && handle(c.userId)}
                    <span className="captain-position">{index + 1}</span>
                    <CaptainPlayerCard
                      userId={c.userId}
                      username={c.username}
                      identity={identities[c.userId]}
                    />
                    <div className="captain-card-actions">
                      <div className="captain-move-actions">
                        <MutationButton
                          className="secondary"
                          type="button"
                          disabled={!editable || index === 0}
                          aria-label={tr("Move {value0} up", {
                            value0: c.username,
                          })}
                          onClick={() => move(c.userId, order[index - 1])}
                        >
                          ↑
                        </MutationButton>
                        <MutationButton
                          className="secondary"
                          type="button"
                          disabled={!editable || index === order.length - 1}
                          aria-label={tr("Move {value0} down", {
                            value0: c.username,
                          })}
                          onClick={() => move(c.userId, order[index + 1])}
                        >
                          ↓
                        </MutationButton>
                      </div>
                      <ConfirmMutation
                        label={tr("Unappoint")}
                        title={tr("Unappoint {value0}?", {
                          value0: c.username,
                        })}
                        description={tr(
                          "Remove {value0}'s captain appointment and keep their registration.{value1}",
                          {
                            value0: c.username,
                            value1: c.teamId
                              ? " Their empty captain team will be archived. Teams with other players or finalized rosters cannot be removed here."
                              : "",
                          },
                        )}
                        disabled={!editable || changed}
                        url={`/api/admin/tournaments/${slug}/captains`}
                        payload={{
                          command: { action: "revoke", userId: c.userId },
                          expectedVersion: setup.version,
                          confirmed: true,
                        }}
                        onSuccess={() => {
                          setError("");
                          setNotice(`${c.username} is no longer a captain.`);
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">
                {tr("No captains appointed.")}
                {!setup.locked
                  ? tr(" Drop a player card here or use Appoint captain below.")
                  : ""}
              </p>
            )}
          </div>
          {changed && (
            <p className="notice small">{tr("Unsaved captain order.")}</p>
          )}
          {ordered.length > 0 && !setup.locked && (
            <div className="actions">
              <MutationButton
                type="button"
                className="secondary"
                disabled={!changed || pending}
                aria-busy={pending && activeMutation === "order"}
                onClick={() => void mutate({ action: "order", userIds: order })}
              >
                {tr("Save captain order")}
              </MutationButton>
              <MutationButton
                className="secondary"
                type="button"
                disabled={!changed || pending}
                onClick={() => {
                  setOrder(setup.captains.map((c) => c.userId));
                  setNotice("Captain order reset.");
                  setError("");
                }}
              >
                {tr("Reset order")}
              </MutationButton>
            </div>
          )}
        </section>
        <section
          className="panel form-stack"
          aria-labelledby="eligible-pool-heading"
        >
          <div className="section-title">
            <h2 id="eligible-pool-heading">{tr("Eligible remaining pool")}</h2>
            <span className="badge">
              {setup.pool.length}{" "}
              {setup.pool.length === 1 ? tr("player") : tr("players")}
            </span>
          </div>
          <label className="field">
            <span>{tr("Search players")}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tr("Username or osu! ID")}
            />
          </label>
          {pool.length ? (
            <div className="captain-player-grid">
              {pool.map((p) => (
                <article
                  className="captain-player-card"
                  key={p.userId}
                  data-player-id={p.userId}
                  draggable={editable && !changed}
                  onDragStart={(event) => {
                    dragged.current = p.userId;
                    setDragging(p.userId);
                    event.dataTransfer.setData("text/plain", String(p.userId));
                  }}
                  onDragEnd={() => {
                    dragged.current = null;
                    setDragging(null);
                  }}
                >
                  {editable && !changed && handle(p.userId)}
                  <CaptainPlayerCard
                    userId={p.userId}
                    username={p.username}
                    identity={identities[p.userId]}
                  />
                  <MutationButton
                    className="secondary"
                    type="button"
                    disabled={!editable || changed}
                    aria-busy={pending && activeMutation === p.userId}
                    aria-label={tr("Appoint {value0} as captain", {
                      value0: p.username,
                    })}
                    onClick={() => void appoint(p.userId)}
                  >
                    {tr("Appoint captain")}
                  </MutationButton>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted small">
              {search
                ? tr("No players match your search.")
                : tr(
                    "No eligible players remain. Review accepted registrations to build the player pool.",
                  )}
            </p>
          )}
        </section>
      </div>
      <section
        className="panel form-stack"
        aria-labelledby="captain-publication-heading"
      >
        <h2 id="captain-publication-heading">{tr("Publication settings")}</h2>
        <label className="check-field">
          <input
            disabled={readOnly}
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          <span>{tr("Publish captains & order")}</span>
        </label>
        <label className="check-field">
          <input
            disabled={readOnly}
            type="checkbox"
            checked={poolPublished}
            onChange={(e) => setPoolPublished(e.target.checked)}
          />
          <span>{tr("Publish eligible draft pool")}</span>
        </label>
        <ConfirmMutation
          label={tr("Save publication settings")}
          title={tr("Change public visibility?")}
          description={tr(
            "This releases the selected captain identities and draft pool. Accepted players remain in the Players directory.",
          )}
          disabled={
            pending ||
            changed ||
            (published ===
              (setup.captains.length > 0 &&
                setup.captains.every((c) => c.published)) &&
              poolPublished === setup.poolPublished)
          }
          url={`/api/admin/tournaments/${slug}/captains`}
          payload={{
            command: { action: "publish", published, poolPublished },
            expectedVersion: setup.version,
            confirmed: true,
          }}
        />
      </section>
      <section
        className="panel form-stack"
        aria-label={tr("Captain and pool controls")}
      >
        <div
          className="actions"
          role="group"
          aria-label={tr("Captain and pool controls")}
        >
          {[
            ["replace", "Replace captain"],
            ["availability", "Update draft availability"],
            ["lock", "Lock draft setup"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="secondary"
              aria-pressed={action === value}
              onClick={() => setAction(value)}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        {["replace", "availability"].includes(action) && (
          <label className="field">
            <span>{tr("Player")}</span>
            <select
              disabled={readOnly}
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                const candidate = setup.candidates.find(
                  (c) => c.userId === Number(e.target.value),
                );
                setAvailable(!candidate?.unavailableReason);
                setExplanation(candidate?.unavailableReason ?? "");
              }}
            >
              <option value="">{tr("Choose an accepted player")}</option>
              {setup.candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.username} ({c.userId})
                </option>
              ))}
            </select>
          </label>
        )}
        {action === "replace" && (
          <label className="field">
            <span>{tr("Captain to replace")}</span>
            <select
              disabled={readOnly}
              value={previousUserId}
              onChange={(e) => setPrevious(e.target.value)}
            >
              <option value="">{tr("Choose captain")}</option>
              {setup.captains.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.username}
                </option>
              ))}
            </select>
          </label>
        )}
        {action === "availability" && (
          <label className="check-field">
            <input
              disabled={readOnly}
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            <span>{tr("Player is available for draft")}</span>
          </label>
        )}

        {action === "availability" && !available && (
          <label className="field">
            <span>{tr("Draft unavailability explanation")}</span>
            <textarea
              disabled={readOnly}
              value={unavailableExplanation}
              onChange={(e) => setExplanation(e.target.value)}
              maxLength={1000}
            />
          </label>
        )}
        <ConfirmMutation
          requireConfirmation={[
            "publish",
            "lock",
            "replace",
            "availability",
          ].includes(action)}
          disabled={
            pending ||
            changed ||
            ((action === "availability"
              ? setup.availabilityLocked
              : setup.locked) &&
              action !== "publish") ||
            (action === "replace" && (!userId || !previousUserId)) ||
            (action === "availability" &&
              (!userId || (!available && !unavailableExplanation.trim())))
          }
          label={tr(
            action === "replace"
              ? "Replace captain"
              : action === "lock"
                ? "Lock draft setup"
                : "Update draft availability",
          )}
          title={tr("Apply this captain setup change?")}
          description={tr(
            "This can change draft eligibility or release player identities publicly. Review the selected players and approval before confirming.",
          )}
          url={`/api/admin/tournaments/${slug}/captains`}
          payload={{
            command,
            expectedVersion: setup.version,
            confirmed: true,
          }}
        />
      </section>
    </div>
  );
}
