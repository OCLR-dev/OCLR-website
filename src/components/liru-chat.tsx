"use client";
import { useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type SourceMessagePartProps,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/ai-sdk";
import { useAppTranslations } from "@/i18n/shared";
import { LiruChatIcon } from "./liru-chat-icon";
import styles from "./liru-chat.module.css";

function Source(part: SourceMessagePartProps) {
  if (part.sourceType !== "url") return null;
  return (
    <a className="text-link" href={part.url}>
      [{part.id}] {part.title}
    </a>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className={styles.reply}>
      <LiruChatIcon />
      <div className={styles.parts}>
        <MessagePrimitive.Parts components={{ Source }} />
      </div>
    </MessagePrimitive.Root>
  );
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className={styles.question}>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

export function LiruChat({ edition }: { edition: string }) {
  const tr = useAppTranslations();
  const locale = tr.locale;
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            edition,
            locale,
            questions: messages
              .filter((m) => m.role === "user")
              .slice(-4)
              .map((m) =>
                m.parts
                  .filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("\n"),
              ),
          },
        }),
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (!response.ok) throw new Error(String(response.status));
          return response;
        },
      }),
    [edition, locale],
  );
  const chat = useChat({ id: edition, transport });
  const runtime = useAISDKRuntime(chat);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className={styles.chat}>
        <div
          className={styles.history}
          role="log"
          aria-label={tr("Conversation")}
        >
          <ThreadPrimitive.Messages
            components={{ AssistantMessage, UserMessage }}
          />
        </div>
        {chat.error && (
          <div role="alert" className="notice">
            {chat.error.message === "401" ? (
              <a href={`/auth/osu?chat_edition=${encodeURIComponent(edition)}`}>
                {tr("Sign in to ask Liru")}
              </a>
            ) : chat.error.message === "429" ? (
              tr("Please wait a minute before asking again.")
            ) : (
              tr("Liru could not finish the answer. Please try again.")
            )}
          </div>
        )}
        <ComposerPrimitive.Root className={styles.composer}>
          <ComposerPrimitive.Input
            aria-label={tr("Ask Liru")}
            placeholder={tr("Ask about this season…")}
            maxLength={1500}
            rows={2}
          />
          <div className="actions">
            {busy ? (
              <ComposerPrimitive.Cancel>{tr("Stop")}</ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send>{tr("Send")}</ComposerPrimitive.Send>
            )}
            {!busy &&
              chat.messages.length > 0 &&
              chat.error?.message !== "401" && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void chat.regenerate()}
                >
                  {tr("Try again")}
                </button>
              )}
          </div>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
