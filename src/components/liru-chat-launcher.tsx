"use client";

import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { chatEditionForPage, type ChatEdition } from "@/lib/chat-edition";
import type { User } from "@/lib/auth/sessions";
import { pickLiruSuggestions } from "@/lib/liru-chat-suggestions";
import { LiruChatIcon } from "./liru-chat-icon";
import styles from "./liru-chat.module.css";

const Chat = lazy(() =>
  import("./liru-chat").then(({ LiruChat }) => ({ default: LiruChat })),
);

export function SiteLiruChat({
  path,
  query,
  editions,
  viewer,
}: {
  path: string;
  query: Pick<URLSearchParams, "get" | "toString"> | null;
  editions: readonly ChatEdition[];
  viewer: User | null;
}) {
  const edition = chatEditionForPage(path, query, editions);
  if (!edition) return null;
  const search = query?.toString();
  return (
    <LiruChatLauncher
      key={edition.slug}
      edition={edition}
      returnTo={path + (search ? "?" + search : "")}
      viewer={viewer}
    />
  );
}

function LiruChatLauncher({
  edition,
  returnTo,
  viewer,
}: {
  edition: ChatEdition;
  returnTo: string;
  viewer: User | null;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const openChat = () => {
      if (window.location.hash !== "#ask-liru" || !panel.current) return;
      if (!panel.current.matches(":popover-open")) panel.current.showPopover();
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    };
    openChat();
    window.addEventListener("hashchange", openChat);
    return () => window.removeEventListener("hashchange", openChat);
  }, [returnTo]);
  const label = tr("Ask Liru");
  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
      >
        <LiruChatIcon size={36} />
      </button>
      <section
        ref={panel}
        id={id}
        onToggle={(event) => {
          if (
            viewer &&
            event.target === event.currentTarget &&
            event.newState === "open"
          )
            setSuggestions(pickLiruSuggestions(tr));
        }}
        popover="auto"
        role="dialog"
        aria-labelledby={id + "-title"}
        className={styles.popup}
      >
        <header className={styles.popupHeader}>
          <h2 id={id + "-title"}>
            <LiruChatIcon size={24} />
            <span>
              {label} · {edition.name}
            </span>
          </h2>
          <button
            type="button"
            className={styles.close}
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label={tr("Close")}
          >
            ×
          </button>
        </header>
        {viewer ? (
          <>
            <p className={styles.disclosure}>
              {tr(
                "This device keeps your last 20 completed turns. Your question, up to 3 recent question-and-answer pairs and relevant public tournament information are sent to the configured AI provider.",
              )}
            </p>
            {suggestions.length > 0 && (
              <Suspense fallback={null}>
                <Chat
                  edition={edition.slug}
                  suggestions={suggestions}
                  viewer={viewer}
                />
              </Suspense>
            )}
          </>
        ) : (
          <a
            className="button"
            href={
              "/auth/osu?" +
              new URLSearchParams({
                chat_edition: edition.slug,
                chat_return: returnTo,
              })
            }
          >
            {tr("Sign in to ask Liru")}
          </a>
        )}
      </section>
    </>
  );
}
