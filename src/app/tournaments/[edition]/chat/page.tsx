import { notFound } from "next/navigation";
import { getPublicEdition } from "@/lib/content";
import { currentUser } from "@/lib/auth/user";
import { chatConfiguration } from "@/lib/chat-config";
import { getAppTranslations } from "@/i18n/server";
import { pickLiruSuggestions } from "@/lib/liru-chat-suggestions";
import { LiruChat } from "@/components/liru-chat";
import { LiruChatIcon } from "@/components/liru-chat-icon";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  if (!chatConfiguration()) notFound();
  const { edition: slug } = await params;
  const edition = await getPublicEdition(slug);
  if (!edition) notFound();
  const tr = await getAppTranslations();
  const user = await currentUser();
  return (
    <section className="panel stack">
      <h1>
        <LiruChatIcon /> {tr("Ask Liru")} · {edition.name}
      </h1>
      {user ? (
        <>
          <p className="muted">
            {tr(
              "This device keeps your last 20 completed turns. Your question, up to 3 recent question-and-answer pairs and relevant public tournament information are sent to the configured AI provider.",
            )}
          </p>
          <LiruChat
            key={slug}
            edition={slug}
            viewer={user}
            suggestions={pickLiruSuggestions(tr)}
          />
        </>
      ) : (
        <a
          className="button"
          href={`/auth/osu?chat_edition=${encodeURIComponent(slug)}`}
        >
          {tr("Sign in to ask Liru")}
        </a>
      )}
    </section>
  );
}
