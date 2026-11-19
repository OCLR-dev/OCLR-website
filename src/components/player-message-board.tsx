"use client";
import { Avatar } from "./avatar";
import { LoadingRegion } from "./loading-region";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import type { PostLiruGalleryMessageInput } from "@/lib/liru-gallery-message-write-contract";
import type { LiruGalleryMessage as Message } from "@/lib/player-message-model";
import type {
  DeletePlayerMessageInput,
  EditPlayerMessageInput,
} from "@/lib/player-message-write-contract";
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
  return (
    <SignedMessageBoard
      endpoint={`/api/tournaments/${edition}/players/${playerId}/messages`}
      name={name}
      signedIn={signedIn}
      viewerId={viewerId}
    />
  );
}

export function SignedMessageBoard({
  endpoint,
  name,
  signedIn,
  viewerId,
  readOnly = false,
  showAll = false,
}: {
  endpoint: string;
  name: string;
  signedIn: boolean;
  viewerId?: number;
  readOnly?: boolean;
  showAll?: boolean;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [editText, setEditText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Message | null>(null);
  const [recovery, setRecovery] = useState<{
    draft: string;
    latest: Message | null;
  } | null>(null);
  const [editConflict, setEditConflict] = useState(false);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const pending = busy || reloading;
  const region = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef<string | null>(null);
  const replyRequestId = useRef<string | null>(null);
  const readGeneration = useRef(0);
  const loadError = tr(
    "Messages could not be loaded. Please refresh to try again.",
  );
  const receive = useCallback((rows: Message[]) => {
    setMessages(rows);
    setCurrentId((previous) =>
      rows.some((m) => m.id === previous)
        ? previous
        : (rows[Math.floor(Math.random() * rows.length)]?.id ?? null),
    );
    setLoaded(true);
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal): Promise<Message[] | null> => {
      const generation = ++readGeneration.current;
      try {
        const response = await fetch(endpoint, { signal });
        if (!response.ok) throw new Error();
        const rows: Message[] = await response.json();
        if (signal?.aborted || generation !== readGeneration.current)
          return null;
        receive(rows);
        return rows;
      } catch {
        if (signal?.aborted || generation !== readGeneration.current)
          return null;
        setError(loadError);
        return null;
      }
    },
    [endpoint, receive, loadError],
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
        void load(controller.signal);
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
  const draft = editing ? editText : replyTo ? replyText : text;
  function close(messageId = editing?.id ?? deleting?.id ?? replyTo) {
    setOpen(false);
    setEditing(null);
    setReplyTo(null);
    setEditConflict(false);
    setDeleting(null);
    setError("");
    requestAnimationFrame(() => {
      const row =
        showAll && messageId
          ? document.getElementById(`${id}-message-${messageId}`)
          : null;
      (row ?? trigger.current)?.focus();
    });
  }
  function showMessage(message: Message) {
    // A confirmed write supersedes every list read already in flight.
    readGeneration.current++;
    setLoaded(true);
    setMessages((rows) => {
      if (rows.some((row) => row.id === message.id))
        return rows.map((row) => (row.id === message.id ? message : row));
      const updated = [message, ...rows];
      return showAll ? updated : updated.slice(0, 20);
    });
    setCurrentId(message.id);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || editConflict) return;
    setBusy(true);
    setError("");
    const postId = replyTo ? replyRequestId : requestId;
    const payload = editing
      ? ({
          text: editText,
          version: editing.version,
        } satisfies EditPlayerMessageInput)
      : ({
          text: draft,
          requestId: (postId.current ??= crypto.randomUUID()),
          ...(replyTo ? { parentId: replyTo } : {}),
        } satisfies PostLiruGalleryMessageInput);
    try {
      const response = await fetch(
        editing ? `${endpoint}/${editing.id}` : endpoint,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        if (editing && (response.status === 409 || response.status === 404))
          setEditConflict(true);
        return;
      }
      showMessage(result as Message);
      if (!editing) {
        if (replyTo) setReplyText("");
        else setText("");
        postId.current = null;
      }
      close();
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (pending || !deleting) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/${deleting.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: deleting.version,
        } satisfies DeletePlayerMessageInput),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error);
        return;
      }
      readGeneration.current++;
      setLoaded(true);
      const deletedIndex = messages.findIndex((m) => m.id === deleting.id);
      const remaining = messages.filter((m) => m.id !== deleting.id);
      const nextId =
        remaining[Math.min(deletedIndex, remaining.length - 1)]?.id ?? null;
      setMessages((rows) =>
        rows
          .filter((m) => m.id !== deleting.id)
          .map((m) =>
            m.parentId === deleting.id ? { ...m, parentId: undefined } : m,
          ),
      );
      setCurrentId(nextId);
      close(nextId);
      if (showAll && !deleting.parentId) await load();
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (pending) return;
    setReloading(true);
    try {
      const rows = await load();
      if (!rows) return;
      if (editing) {
        const latest =
          rows.find(
            (message) =>
              message.id === editing.id && message.authorId === viewerId,
          ) ?? null;
        // End the old edit session. A new version is only used after the user
        // explicitly reviews the latest message and chooses to edit it.
        setRecovery({ draft: editText, latest });
        setEditing(null);
        setEditConflict(false);
        setOpen(false);
        if (latest) setCurrentId(latest.id);
      }
      if (replyTo && !rows.some((message) => message.id === replyTo)) {
        setRecovery({ draft: replyText, latest: null });
        setReplyTo(null);
        setOpen(false);
      }
      setDeleting(null);
      setError("");
    } catch {
      setError(loadError);
    } finally {
      setReloading(false);
    }
  }
  const navigation = !showAll && messages.length > 1 && (
    <div
      className="player-message-navigation"
      role="group"
      aria-label={tr("Message navigation")}
    >
      <button
        type="button"
        disabled={pending || open || !!deleting}
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
        disabled={pending || open || !!deleting}
        aria-label={tr("Next message")}
        onClick={() => setCurrentId(messages[(index + 1) % messages.length].id)}
      >
        →
      </button>
    </div>
  );
  const compose = signedIn ? (
    <button
      ref={trigger}
      type="button"
      className="secondary"
      aria-expanded={open}
      aria-controls={`${id}-form`}
      disabled={pending || !!deleting || (showAll && (open || !loaded))}
      onClick={() => {
        setEditing(null);
        setEditConflict(false);
        setOpen(true);
        setError("");
      }}
    >
      {tr("Leave a message")}
    </button>
  ) : !readOnly ? (
    <Link className="text-link small" href="/login">
      {tr("Sign in with osu! to leave a signed message")}
    </Link>
  ) : null;

  function messageActions(message: Message) {
    return (
      signedIn &&
      viewerId !== undefined &&
      message.authorId === viewerId &&
      !open &&
      !deleting && (
        <>
          <button
            type="button"
            className="secondary"
            aria-label={tr("Edit message")}
            disabled={pending}
            onClick={() => {
              setEditing(message);
              setEditConflict(false);
              setEditText(message.text);
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
            disabled={pending}
            onClick={() => {
              setDeleting(message);
              setError("");
            }}
          >
            {tr("Delete")}
          </button>
        </>
      )
    );
  }

  const confirmation = deleting && (
    <div
      className="player-message-confirm"
      role="group"
      aria-label={tr("Delete this message?")}
    >
      {busy && <LoadingRegion />}
      <p>{tr("Delete this message?")}</p>
      <div className="player-message-controls">
        <button
          type="button"
          disabled={pending}
          aria-busy={busy}
          onClick={remove}
        >
          {tr("Confirm delete")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => close()}
        >
          {tr("Cancel")}
        </button>
      </div>
    </div>
  );
  const form = signedIn && open && (
    <form id={`${id}-form`} className="player-message-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={id}>
        {editing
          ? tr("Edit message")
          : replyTo
            ? tr("Reply")
            : tr("Leave a signed message for {name}", { name })}
      </label>
      <textarea
        ref={input}
        id={id}
        value={draft}
        onChange={(e) => {
          if (editing) setEditText(e.target.value);
          else if (replyTo) {
            setReplyText(e.target.value);
            replyRequestId.current = null;
          } else {
            setText(e.target.value);
            requestId.current = null;
          }
        }}
        maxLength={1000}
        rows={2}
        required
        disabled={pending}
      />
      <div className="player-message-controls">
        <button disabled={pending || editConflict || !draft.trim()}>
          {busy
            ? tr("Saving…")
            : editing
              ? tr("Save message")
              : replyTo
                ? tr("Reply")
                : tr("Post message")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => close()}
        >
          {tr("Cancel")}
        </button>
      </div>
    </form>
  );
  const draftRecovery = recovery && (
    <div className="player-message-form" role="status">
      <p>
        {recovery.latest
          ? tr("Review the latest message before applying your saved draft.")
          : tr(
              "This message is no longer available. Your unsaved draft is kept below for you to copy.",
            )}
      </p>
      {recovery.latest && (
        <div>
          <strong>{tr("Latest message")}</strong>
          <p className="preserve-lines">{recovery.latest.text}</p>
        </div>
      )}
      <label htmlFor={`${id}-draft`}>{tr("Your unsaved draft")}</label>
      <textarea id={`${id}-draft`} readOnly value={recovery.draft} rows={2} />
      <div className="player-message-controls">
        {recovery.latest && (
          <button
            type="button"
            disabled={pending || open || !!deleting}
            onClick={() => {
              setEditing(recovery.latest);
              setEditText(recovery.draft);
              setEditConflict(false);
              setOpen(true);
              setRecovery(null);
              setError("");
            }}
          >
            {tr("Edit latest message with this draft")}
          </button>
        )}
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => setRecovery(null)}
        >
          {tr("Discard draft")}
        </button>
      </div>
    </div>
  );
  const errorPanel = error && (
    <div role="alert" className="small error-text">
      <p>{tr(error)}</p>
      <button
        type="button"
        className="secondary"
        disabled={pending}
        onClick={reload}
      >
        {reloading ? tr("Loading…") : tr("Reload messages")}
      </button>
    </div>
  );
  const repliesByParent = new Map<string, Message[]>();
  const visibleMessages: Message[] = [];
  if (showAll) {
    const rootIds = new Set(
      messages
        .filter((message) => !message.parentId)
        .map((message) => message.id),
    );
    for (const message of messages) {
      if (message.parentId && rootIds.has(message.parentId)) {
        const replies = repliesByParent.get(message.parentId);
        if (replies) replies.push(message);
        else repliesByParent.set(message.parentId, [message]);
      } else visibleMessages.push(message);
    }
  } else if (current) visibleMessages.push(current);

  function renderMessage(message: Message, replies?: ReactNode) {
    const isEditing = editing?.id === message.id;
    const isDeleting = deleting?.id === message.id;
    const isReplying = replyTo === message.id;
    const meta = (
      <>
        <a href={`https://osu.ppy.sh/users/${message.authorId}`}>
          {showAll && (
            <Avatar osuId={message.authorId} username={message.author} />
          )}
          <strong>{message.author}</strong>
        </a>
        <time className="small muted" dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleString(tr.locale)}
        </time>
      </>
    );
    return (
      <div
        key={message.id}
        className={showAll ? "event-message-entry" : undefined}
        id={showAll ? `${id}-message-${message.id}` : undefined}
        tabIndex={showAll ? -1 : undefined}
      >
        {showAll ? <div className="event-message-meta">{meta}</div> : meta}
        <p className="preserve-lines">{message.text}</p>
        {showAll && (
          <>
            <div className="player-message-controls">
              {signedIn && !message.parentId && !open && !deleting && (
                <button
                  className="secondary"
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setReplyTo(message.id);
                    setReplyText("");
                    replyRequestId.current = null;
                    setError("");
                    setOpen(true);
                  }}
                >
                  {tr("Reply")}
                </button>
              )}
              {messageActions(message)}
            </div>
            {(isEditing || isReplying) && form}
            {isDeleting && confirmation}
            {(isEditing || isDeleting || isReplying) && errorPanel}
          </>
        )}
        {replies}
      </div>
    );
  }

  return (
    <>
      {showAll && (
        <>
          <div className="player-message-controls">{compose}</div>
          {!editing && !replyTo && form}
          {draftRecovery}
          {!editing && !deleting && !replyTo && errorPanel}
        </>
      )}
      <div
        ref={region}
        className={showAll ? "event-message-list" : "event-message-scroll"}
        tabIndex={showAll ? undefined : 0}
        role="region"
        aria-label={tr("Messages for {name}", { name })}
        aria-live={showAll ? undefined : "polite"}
      >
        {visibleMessages.length > 0 ? (
          visibleMessages.map((message) => {
            const replies = repliesByParent.get(message.id);
            return renderMessage(
              message,
              replies && (
                <div className="event-message-replies">
                  {replies.toReversed().map((reply) => renderMessage(reply))}
                </div>
              ),
            );
          })
        ) : (
          <p>
            {loaded ? (showAll ? tr("No comments yet.") : "—") : tr("Loading…")}
          </p>
        )}
      </div>
      {!showAll && (
        <>
          <div className="player-message-controls">
            {navigation}
            {compose}
            {current && messageActions(current)}
          </div>
          {confirmation}
          {form}
          {draftRecovery}
          {errorPanel}
        </>
      )}
    </>
  );
}
