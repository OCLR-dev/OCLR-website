"use client";
import Image from "next/image";
import Markdown, { defaultUrlTransform } from "react-markdown";
import type { Root, Parents } from "mdast";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type TextMessagePartProps,
  useAuiState,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/ai-sdk";
import { useAppTranslations } from "@/i18n/shared";
import type { User } from "@/lib/auth/sessions";
import {
  clearLiruHistory,
  restoreLiruHistory,
  saveLiruTurn,
} from "@/lib/liru-chat-history";
import {
  rememberCompletedAnswer,
  chatTurnContext,
} from "@/lib/chat-turn-context";
import { Avatar } from "./avatar";
import styles from "./liru-chat.module.css";

function useAnswerSources() {
  const parts = useAuiState((state) => state.message.parts);
  return parts
    .filter((part) => part.type === "source" && part.sourceType === "url")
    .filter((part) => defaultUrlTransform(part.url));
}

function AnswerSources() {
  const tr = useAppTranslations();
  const sources = useAnswerSources();
  if (!sources.length) return null;
  const label = tr("Source");
  return (
    <details className={styles.sources}>
      <summary>{label}</summary>
      <ul aria-label={label}>
        {sources.map((part) => (
          <li key={part.id}>
            <a className={styles.sourceLink} href={part.url}>
              <span>{part.title || part.url}</span>
              <span className={styles.sourceArrow} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AnswerText({ text }: TextMessagePartProps) {
  const sources = useAnswerSources();
  const ids = new Set(sources.map((part) => part.id));
  const urls = new Set(sources.map((part) => part.url));
  function citations() {
    function walk(parent: Parents) {
      for (const child of parent.children) {
        if (child.type === "link" || child.type === "linkReference") continue;
        if ("children" in child) walk(child);
        if (child.type === "text")
          child.value = child.value.replace(
            /[ \t]*\[(\d+)\]/g,
            (marker, id: string) => (ids.has(id) ? "" : marker),
          );
      }
    }
    return (tree: Root) => walk(tree);
  }
  return (
    <div className={styles.markdown}>
      <Markdown
        skipHtml
        remarkPlugins={[citations]}
        components={{
          img: () => null,
          a: ({ href, children }) =>
            href && urls.has(href) ? (
              <a className="text-link" href={href}>
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className={styles.reply}>
      <Image
        className={styles.avatar}
        src="/mascot/liru/chat-wink.webp"
        alt=""
        width={34}
        height={34}
        unoptimized
      />
      <div className={styles.parts}>
        <MessagePrimitive.Parts
          components={{ Source: () => null, Text: AnswerText }}
        />
        <AnswerSources />
      </div>
    </MessagePrimitive.Root>
  );
}
function UserMessage({ viewer }: { viewer: User }) {
  return (
    <MessagePrimitive.Root className={styles.question}>
      <div className={styles.questionBubble}>
        <MessagePrimitive.Parts />
      </div>
      <Avatar osuId={viewer.osuId} username={viewer.username} />
    </MessagePrimitive.Root>
  );
}

type ChatProps = {
  edition: string;
  suggestions: readonly string[];
  viewer: User;
};

const subscribeToHydration = () => () => {};
export function LiruChat(props: ChatProps) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const historyKey = `oclr:liru:v1:${props.viewer.osuId}:${props.edition}`;
  return mounted ? (
    <LocalChat key={historyKey} {...props} historyKey={historyKey} />
  ) : null;
}

function LocalChat({
  edition,
  suggestions,
  viewer,
  historyKey,
}: ChatProps & { historyKey: string }) {
  const tr = useAppTranslations();
  const locale = tr.locale;
  const [messages] = useState(() => restoreLiruHistory(historyKey));
  const [completed] = useState(() => {
    const answers = new Map<string, string>();
    for (let i = 1; i < messages.length; i += 2)
      rememberCompletedAnswer(answers, messages[i - 1], messages[i]);
    return answers;
  });
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            edition,
            locale,
            ...chatTurnContext(messages, completed),
          },
        }),
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (!response.ok) throw new Error(String(response.status));
          return response;
        },
      }),
    [edition, locale, completed],
  );
  const chat = useChat({
    id: historyKey,
    messages,
    transport,
    onFinish: ({ messages, isAbort, isDisconnect, isError, finishReason }) => {
      if (
        !isAbort &&
        !isDisconnect &&
        !isError &&
        finishReason !== "interrupted" &&
        finishReason !== "error"
      ) {
        rememberCompletedAnswer(completed, messages.at(-2), messages.at(-1));
        saveLiruTurn(historyKey, messages);
      }
    },
  });
  const runtime = useAISDKRuntime(chat);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const last = chat.messages.at(-1);
  const waiting =
    busy &&
    (chat.status === "submitted" ||
      last?.role !== "assistant" ||
      !last.parts.some((part) => part.type === "text" && part.text.trim()));
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className={styles.chat}>
        <ThreadPrimitive.Viewport
          className={styles.history}
          role="log"
          aria-label={tr("Conversation")}
        >
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (message.role === "user")
                return <UserMessage viewer={viewer} />;
              if (message.role === "assistant") return <AssistantMessage />;
              return null;
            }}
          </ThreadPrimitive.Messages>
          {waiting && (
            <div role="status" className={styles.pending}>
              {tr("Loading…")}
            </div>
          )}
        </ThreadPrimitive.Viewport>
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
          <div className={styles.suggestions}>
            {suggestions.map((question) => (
              <ThreadPrimitive.Suggestion
                key={question}
                type="button"
                className="secondary"
                prompt={question}
                send
                clearComposer={false}
                disabled={busy || chat.error?.message === "401"}
              >
                {question}
              </ThreadPrimitive.Suggestion>
            ))}
          </div>
          <div className={styles.inputBox}>
            <ComposerPrimitive.Input
              aria-label={tr("Ask Liru")}
              placeholder={tr("Ask about this season…")}
              maxLength={1500}
              rows={2}
            />
            <div className={styles.actions}>
              {!busy && chat.messages.length > 0 && (
                <button
                  type="button"
                  className={styles.retry}
                  onClick={() => {
                    clearLiruHistory(historyKey);
                    completed.clear();
                    chat.setMessages([]);
                    chat.clearError();
                  }}
                >
                  {tr("Clear")}
                </button>
              )}
              {busy ? (
                <ComposerPrimitive.Cancel>
                  {tr("Stop")}
                </ComposerPrimitive.Cancel>
              ) : (
                <ComposerPrimitive.Send>{tr("Send")}</ComposerPrimitive.Send>
              )}
              {!busy &&
                chat.messages.length > 0 &&
                chat.error?.message !== "401" && (
                  <button
                    type="button"
                    className={styles.retry}
                    onClick={() => void chat.regenerate()}
                  >
                    {tr("Try again")}
                  </button>
                )}
            </div>
          </div>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
