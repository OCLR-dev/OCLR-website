"use client";

import Image from "next/image";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { User } from "@/lib/auth/sessions";
import { pickLiruSuggestions } from "@/lib/liru-chat-suggestions";
import { LiruChatIcon } from "./liru-chat-icon";
import styles from "./liru-chat.module.css";

const Chat = lazy(() =>
  import("./liru-chat").then(({ LiruChat }) => ({ default: LiruChat })),
);

export function LiruChatLauncher({
  edition,
  viewer,
}: {
  edition: string;
  viewer: User | null;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === "#ask-liru") {
      panel.current?.showPopover();
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);
  const label = tr("Ask Liru");
  return (
    <>
      <button
        type="button"
        className="liru-chat-launcher"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
      >
        <Image
          src="/mascot/liru/chat-launcher.webp"
          alt=""
          width={36}
          height={36}
          unoptimized
        />
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
            <LiruChatIcon size={24} /> {label}
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
                "Your question, recent questions and relevant public tournament information are sent to the configured AI provider.",
              )}
            </p>
            <Suspense fallback={null}>
              <Chat
                edition={edition}
                suggestions={suggestions}
                viewer={viewer}
              />
            </Suspense>
          </>
        ) : (
          <a
            className="button"
            href={`/auth/osu?chat_edition=${encodeURIComponent(edition)}`}
          >
            {tr("Sign in to ask Liru")}
          </a>
        )}
      </section>
    </>
  );
}
