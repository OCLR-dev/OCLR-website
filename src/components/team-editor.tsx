"use client";
import { ReadOnlyFields, MutationButton } from "./staff-read-only";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { usePendingRefresh } from "./use-pending-refresh";
import { LoadingRegion } from "./loading-region";
import { useAppTranslations } from "@/i18n/shared";
import type { staffTeams } from "@/lib/teams";
import { TeamAvatar } from "./team-avatar";
export function TeamEditor({
  slug,
  version,
  team,
  locked,
}: {
  slug: string;
  version: number;
  team: Awaited<ReturnType<typeof staffTeams>>["teams"][number];
  locked: boolean;
}) {
  const tr = useAppTranslations(),
    { refreshing, refresh } = usePendingRefresh(),
    dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [remove, setRemove] = useState(false),
    [requestPending, setPending] = useState(false),
    [error, setError] = useState(""),
    [opened, setOpened] = useState(0);
  const pending = requestPending || refreshing;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function chooseImage(value: File | null) {
    setImage(value);
    setPreview(value ? URL.createObjectURL(value) : null);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    form.set("expectedVersion", String(version));
    form.set("removeAvatar", String(remove));
    if (image) form.set("image", image);
    try {
      const r = await fetch(`/api/admin/tournaments/${slug}/teams/${team.id}`, {
        method: "PATCH",
        body: form,
      });
      const data = await r.json();
      if (!r.ok) {
        // Load the current team so the form is not resubmitted with stale data.
        refresh();
        throw new Error(data.error);
      }
      dialog.current?.close();
      refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be completed.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      {refreshing && !error && <LoadingRegion />}
      <button
        disabled={pending}
        aria-busy={pending}
        type="button"
        className="secondary"
        onClick={() => {
          chooseImage(null);
          setRemove(false);
          setError("");
          setOpened((n) => n + 1);
          dialog.current?.showModal();
        }}
      >
        {tr("Edit team")}
      </button>
      <dialog
        ref={dialog}
        className="team-editor-dialog"
        aria-label={tr("Edit team")}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        {(requestPending || (refreshing && !!error)) && <LoadingRegion />}
        {/* Remount so inputs show the latest saved team, not earlier typing. */}
        <form
          key={`${opened}:${version}`}
          className="form-stack"
          onSubmit={save}
        >
          <ReadOnlyFields>
            <h2>{tr("Edit team")}</h2>
            <label className="field">
              <span>{tr("Team name")}</span>
              <input
                required
                disabled={pending}
                name="name"
                maxLength={80}
                defaultValue={team.name}
              />
            </label>
            <label className="field">
              <span>{tr("Roster capacity (optional)")}</span>
              <input
                disabled={pending}
                name="capacity"
                type="number"
                min={team.members.length}
                max={256}
                readOnly={locked || !!team.finalizedAt}
                defaultValue={team.capacity ?? ""}
              />
            </label>
            <div className="team-image-preview">
              {preview ? (
                <Image
                  width={96}
                  height={96}
                  src={preview}
                  unoptimized
                  alt={tr("Pending team image")}
                />
              ) : (
                <TeamAvatar
                  team={{ ...team, avatarKey: remove ? null : team.avatarKey }}
                />
              )}
            </div>
            <label className="field">
              <span>{tr("Team avatar")}</span>
              <input
                disabled={pending}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  chooseImage(e.target.files?.[0] ?? null);
                  setRemove(false);
                }}
              />
            </label>
            <p className="small muted">
              {tr("JPEG, PNG or WebP · up to 5 MB · saved as a square image")}
            </p>
          </ReadOnlyFields>
          <div className="actions">
            <MutationButton
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => {
                setRemove(true);
                chooseImage(null);
              }}
            >
              {tr("Remove avatar")}
            </MutationButton>
            <MutationButton
              disabled={pending}
              aria-busy={pending}
              type="submit"
            >
              {tr("Save team")}
            </MutationButton>
            <button
              disabled={pending}
              type="button"
              className="secondary"
              onClick={() => dialog.current?.close()}
            >
              {tr("Cancel")}
            </button>
          </div>
          {error && (
            <p className="notice error-text" role="alert">
              {tr(error)}
            </p>
          )}
        </form>
      </dialog>
    </>
  );
}
