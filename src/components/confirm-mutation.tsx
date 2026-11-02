"use client";

import { useStaffReadOnly } from "./staff-read-only";
import { useAppTranslations } from "@/i18n/shared";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePendingRefresh } from "./use-pending-refresh";
import { LoadingRegion } from "./loading-region";
import { Spinner } from "./spinner";
export function ConfirmMutation({
  label,
  className = "secondary",
  title,
  description,
  url,
  payload,
  onSuccess,
  onError,
  requireConfirmation = true,
  canConfirm = true,
  disabled = false,
  icon,
  errorTarget,
  children,
}: {
  label: string;
  className?: string;
  title: string;
  description?: string;
  url: string;
  payload: Record<string, unknown>;
  onSuccess?: () => void | Promise<void>;
  onError?: (message: string) => void;
  requireConfirmation?: boolean;
  canConfirm?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  errorTarget?: HTMLElement | null;
  children?: ReactNode;
}) {
  const readOnly = useStaffReadOnly();
  const tr = useAppTranslations();

  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { refreshing, refresh } = usePendingRefresh();
  const [requestPending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pending = requestPending || refreshing;
  const inlineLoading = !!icon && !requireConfirmation;
  useEffect(() => {
    if (readOnly || disabled) dialog.current?.close();
  }, [readOnly, disabled]);
  async function confirm() {
    if (readOnly || disabled || pending || !canConfirm) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json();
        const message = result.error ?? "The action could not be completed.";
        setError(message);
        onError?.(message);
        refresh();
        return;
      }
      await onSuccess?.();
      dialog.current?.close();
      refresh();
    } catch {
      const message =
        "Connection interrupted. Refresh to check the saved state before retrying.";
      setError(message);
      onError?.(message);
    } finally {
      setPending(false);
    }
  }
  const feedback =
    !requireConfirmation && error ? (
      <p role="alert" className="notice error-text">
        {tr(error)}
      </p>
    ) : null;
  return (
    <>
      {pending &&
        !inlineLoading &&
        (!requireConfirmation || (refreshing && !error)) && <LoadingRegion />}
      <button
        type="button"
        aria-busy={pending}
        aria-label={icon ? tr(label) : undefined}
        title={icon ? tr(label) : undefined}
        className={className}
        disabled={
          readOnly ||
          disabled ||
          pending ||
          (!requireConfirmation && !canConfirm)
        }
        onClick={() => {
          setError("");
          if (requireConfirmation) dialog.current?.showModal();
          else void confirm();
        }}
      >
        {pending && inlineLoading ? <Spinner compact /> : (icon ?? tr(label))}
      </button>
      {feedback &&
        (errorTarget ? createPortal(feedback, errorTarget) : feedback)}
      {requireConfirmation && (
        <dialog
          ref={dialog}
          aria-labelledby={`${id}-title`}
          aria-describedby={description ? `${id}-description` : undefined}
          onCancel={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          {(requestPending || (refreshing && !!error)) && <LoadingRegion />}
          <h2 id={`${id}-title`}>{tr(title)}</h2>
          {description && (
            <p id={`${id}-description`} className="muted">
              {tr(description)}
            </p>
          )}
          {children}
          {error && (
            <p role="alert" className="notice error-text">
              {tr(error)}
            </p>
          )}
          <div className="actions">
            <button
              aria-busy={pending}
              disabled={readOnly || disabled || pending || !canConfirm}
              onClick={confirm}
            >
              {tr("Confirm")}
            </button>
            <button
              className="secondary"
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              {tr("Cancel")}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
