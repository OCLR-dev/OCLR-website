"use client";

import { useAppTranslations } from "@/i18n/shared";
import type { MappoolSuggesterEditorData } from "@/lib/mappool-suggesters";
import { useId, useRef, useState } from "react";
import { ConfirmMutation } from "./confirm-mutation";
import { MappoolActionIcon } from "./mappool-action-icon";

export function MappoolSuggester({
  url,
  poolId,
  version,
  entryId,
  disabled,
  mappoolers,
  candidates,
  saved,
}: {
  url: string;
  poolId: string;
  version: number;
  entryId: string;
  disabled: boolean;
  mappoolers: MappoolSuggesterEditorData["mappoolers"];
  candidates: MappoolSuggesterEditorData["candidates"];
  saved?: MappoolSuggesterEditorData["saved"][number];
}) {
  const tr = useAppTranslations();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const savedValue = saved?.candidateId
    ? `workbench:${saved.candidateId}`
    : saved
      ? `mappooler:${saved.osuId}`
      : "";
  const [selection, setSelection] = useState(savedValue);
  const [source, value] = selection.split(":");
  const selectedSuggester =
    source === "workbench"
      ? { source, candidateId: value }
      : source === "mappooler"
        ? { source, osuId: Number(value) }
        : null;
  const savedOptionMissing =
    saved &&
    (saved.candidateId
      ? !candidates.some(({ candidateId }) => candidateId === saved.candidateId)
      : !mappoolers.some(({ osuId }) => osuId === saved.osuId));
  const title = saved ? tr("Edit suggester") : tr("Add suggester");
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="secondary mappool-labeled-action"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => {
          setSelection(savedValue);
          dialog.current?.showModal();
        }}
      >
        <MappoolActionIcon kind={saved ? "edit" : "suggester"} />
        <span>{title}</span>
      </button>
      <dialog
        ref={dialog}
        className="mappool-suggester-dialog"
        aria-labelledby={id}
        onClose={() => trigger.current?.focus()}
      >
        <h3 id={id}>{title}</h3>
        <label className="field">
          <span>{tr("Suggester")}</span>
          <select
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
          >
            <option value="">{tr("Unassigned")}</option>
            {savedOptionMissing && (
              <option value={savedValue}>{saved.username}</option>
            )}
            {mappoolers.length > 0 && (
              <optgroup label={tr("Mappoolers")}>
                {mappoolers.map(({ osuId, username }) => (
                  <option key={osuId} value={`mappooler:${osuId}`}>
                    {username}
                  </option>
                ))}
              </optgroup>
            )}
            {candidates.length > 0 && (
              <optgroup label={tr("Inherit from selection workbench")}>
                {candidates.map(({ candidateId, username, category }) => (
                  <option key={candidateId} value={`workbench:${candidateId}`}>
                    {username} ·{" "}
                    {category === "unassigned" ? tr("Unassigned") : category}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => dialog.current?.close()}
          >
            {tr("Cancel")}
          </button>
          <ConfirmMutation
            label={tr("Save")}
            title={title}
            url={url}
            payload={{
              action: "entry_suggester_set",
              confirmed: true,
              poolId,
              expectedVersion: version,
              entryId,
              suggester: selectedSuggester,
            }}
            requireConfirmation={false}
            loadingFeedback="button"
            disabled={disabled || selection === savedValue}
            onSuccess={() => dialog.current?.close()}
          />
        </div>
      </dialog>
    </>
  );
}
