"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import type { PlayerMessage } from "@/lib/player-messages";
export function PlayerMessageBoard({
  edition,
  playerId,
  name,
  signedIn,
  viewerId,
}: {
  edition: string;
  playerId: number;
  name: string;
  signedIn: boolean;
  viewerId?: number;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const [messages, setMessages] = useState<PlayerMessage[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [editText, setEditText] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlayerMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef<string | null>(null);
  const endpoint = `/api/tournaments/${edition}/players/${playerId}/messages`;
  const loadError = tr(
    "Messages could not be loaded. Please refresh to try again.",
  );
  const receive = useCallback((rows: PlayerMessage[]) => {
    setMessages(rows);
    setCurrentId((previous) =>
      rows.some((m) => m.id === previous)
        ? previous
        : (rows[Math.floor(Math.random() * rows.length)]?.id ?? null),
    );
    setLoaded(true);
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal): Promise<PlayerMessage[]> => {
      const response = await fetch(endpoint, { signal });
      if (!response.ok) throw new Error();
      return response.json();
    },
    [endpoint],
  );
  useEffect(() => {
    const controller = new AbortController();
    const node = region.current;
    if (!node) return;
    // All identities render immediately; fetch messages only near the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load(controller.signal)
          .then(receive)
          .catch((error) => {
            if (error.name !== "AbortError") setError(loadError);
          });
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [load, receive, loadError]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, editing]);
  const index = Math.max(
    0,
    messages.findIndex((m) => m.id === currentId),
  );
  const current = messages[index];
  function close() {
    setOpen(false);
    setEditing(null);
    setDeleting(false);
    setError("");
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function showMessage(message: PlayerMessage) {
    setMessages((rows) =>
      rows.some((m) => m.id === message.id)
        ? rows.map((m) => (m.id === message.id ? message : m))
        : [message, ...rows].slice(0, 20),
    );
    setCurrentId(message.id);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        editing ? `${endpoint}/${editing.id}` : endpoint,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editing
              ? { text: editText, version: editing.version }
              : { text, requestId: requestId.current },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      showMessage(result);
      if (!editing) {
        setText("");
        requestId.current = null;
      }
      close();
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (busy || !current) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/${current.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: current.version }),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error);
        return;
      }
      const remaining = messages.filter((m) => m.id !== current.id);
      setMessages(remaining);
      setCurrentId(
        remaining[Math.min(index, remaining.length - 1)]?.id ?? null,
      );
      close();
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        ref={region}
        className="event-message-scroll"
        tabIndex={0}
        role="region"
        aria-label={tr("Messages for {name}", { name })}
        aria-live="polite"
      >
        {current ? (
          <div key={current.id}>
            <a href={`https://osu.ppy.sh/users/${current.authorId}`}>
              <strong>{current.author}</strong>
            </a>
            <time className="small muted" dateTime={current.createdAt}>
              {new Date(current.createdAt).toLocaleString(tr.locale)}
            </time>
            <p className="preserve-lines">{current.text}</p>
          </div>
        ) : (
          <p>{loaded ? "—" : tr("Loading…")}</p>
        )}
      </div>
      <div className="player-message-controls">
        {messages.length > 1 && (
          <div
            className="player-message-navigation"
            role="group"
            aria-label={tr("Message navigation")}
          >
            <button
              type="button"
              disabled={busy || open || deleting}
              aria-label={tr("Previous message")}
              onClick={() =>
                setCurrentId(
                  messages[(index - 1 + messages.length) % messages.length].id,
                )
              }
            >
              ←
            </button>
            <span className="small muted">
              {tr("Recent message {current} of {count}", {
                current: index + 1,
                count: messages.length,
              })}
            </span>
            <button
              type="button"
              disabled={busy || open || deleting}
              aria-label={tr("Next message")}
              onClick={() =>
                setCurrentId(messages[(index + 1) % messages.length].id)
              }
            >
              →
            </button>
          </div>
        )}
        {signedIn ? (
          <button
            ref={trigger}
            type="button"
            className="secondary"
            aria-expanded={open}
            aria-controls={`${id}-form`}
            disabled={busy || deleting}
            onClick={() => {
              setEditing(null);
              setOpen(true);
              setError("");
            }}
          >
            {tr("Leave a message")}
          </button>
        ) : (
          <Link className="text-link small" href="/login">
            {tr("Sign in with osu! to leave a signed message")}
          </Link>
        )}
        {current &&
          viewerId !== undefined &&
          current.authorId === viewerId &&
          !open &&
          !deleting && (
            <>
              <button
                type="button"
                className="secondary"
                aria-label={tr("Edit message")}
                disabled={busy}
                onClick={() => {
                  setEditing(current);
                  setEditText(current.text);
                  setOpen(true);
                  setError("");
                }}
              >
                {tr("Edit")}
              </button>
              <button
                type="button"
                className="secondary"
                aria-label={tr("Delete message")}
                disabled={busy}
                onClick={() => {
                  setDeleting(true);
                  setError("");
                }}
              >
                {tr("Delete")}
              </button>
            </>
          )}
      </div>
      {deleting && (
        <div
          className="player-message-confirm"
          role="group"
          aria-label={tr("Delete this message?")}
        >
          <p>{tr("Delete this message?")}</p>
          <div className="player-message-controls">
            <button type="button" disabled={busy} onClick={remove}>
              {tr("Confirm delete")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={close}
            >
              {tr("Cancel")}
            </button>
          </div>
        </div>
      )}
      {signedIn && open && (
        <form
          id={`${id}-form`}
          className="player-message-form"
          onSubmit={submit}
        >
          <label className="sr-only" htmlFor={id}>
            {editing
              ? tr("Edit message")
              : tr("Leave a signed message for {name}", { name })}
          </label>
          <textarea
            ref={input}
            id={id}
            value={editing ? editText : text}
            onChange={(e) => {
              if (editing) setEditText(e.target.value);
              else {
                setText(e.target.value);
                requestId.current = null;
              }
            }}
            maxLength={1000}
            rows={2}
            required
            disabled={busy}
          />
          <div className="player-message-controls">
            <button disabled={busy || !(editing ? editText : text).trim()}>
              {busy
                ? tr("Saving…")
                : editing
                  ? tr("Save message")
                  : tr("Post message")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={close}
            >
              {tr("Cancel")}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div role="alert" className="small error-text">
          <p>{tr(error)}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              load()
                .then(receive)
                .catch(() => setError(loadError));
            }}
          >
            {tr("Reload messages")}
          </button>
        </div>
      )}
    </>
  );
}
