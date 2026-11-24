"use client";

import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type {
  OsuImageCommand,
  OsuImagePolicy,
} from "@/lib/admin-operations-write-contracts";

export function OsuImageSettings({ initial }: { initial: OsuImagePolicy }) {
  const tr = useAppTranslations();
  const [policy, setPolicy] = useState(initial);
  const [hours, setHours] = useState(String(initial.ttlHours));
  const [capacity, setCapacity] = useState(String(initial.capacityMiB));
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const avatar = initial.kind === "avatar";
  const dirty =
    Number(hours) !== policy.ttlHours ||
    Number(capacity) !== policy.capacityMiB;
  async function submit(command: OsuImageCommand) {
    if (busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/admin/settings/osu-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(tr(body.error));
        return;
      }
      // A refresh must not silently rebase another admin's pending policy edit.
      if (command.action === "save") setPolicy(body);
      setFeedback(
        command.action === "save"
          ? tr("Cache settings saved.")
          : avatar
            ? tr("Avatar refreshed for osu! user {id}.", {
                id: command.imageId,
              })
            : tr("Background refreshed for beatmapset {id}.", {
                id: command.imageId,
              }),
      );
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset
      className="settings-card form-stack"
      disabled={busy}
      aria-busy={busy}
    >
      <legend>
        {avatar ? tr("osu! avatar cache") : tr("Beatmap background cache")}
      </legend>
      <form
        className="actions"
        onSubmit={(event) => {
          event.preventDefault();
          void submit({
            action: "save",
            kind: initial.kind,
            ttlHours: Number(hours),
            capacityMiB: Number(capacity),
            expectedRevision: policy.revision,
          });
        }}
      >
        <label className="field">
          {tr("Cache lifetime (hours)")}
          <input
            required
            type="number"
            min={1}
            max={8760}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
        <label className="field">
          {tr("Capacity limit (MiB)")}
          <input
            required
            type="number"
            min={8}
            max={2048}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <button type="submit" disabled={!dirty}>
          {tr("Save")}
        </button>
      </form>
      <form
        className="actions"
        onSubmit={(event) => {
          event.preventDefault();
          void submit({
            action: "refresh",
            kind: initial.kind,
            imageId: Number(id),
          });
        }}
      >
        <label className="field">
          {avatar ? tr("osu! user ID") : tr("Beatmapset ID")}
          <input
            required
            type="number"
            min={1}
            max={2147483647}
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <button className="secondary" type="submit" disabled={!id}>
          {avatar ? tr("Refresh this avatar") : tr("Refresh this background")}
        </button>
      </form>
      {feedback && (
        <p className="small" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="notice error-text" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
