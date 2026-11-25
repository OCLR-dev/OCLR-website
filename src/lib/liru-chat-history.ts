import type { UIMessage } from "ai";
import { messageText } from "./chat-turn-context";
import { z } from "zod";

const turnLimit = 20;
const id = z.string().min(1).max(128);
const sourceUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value, "https://oclr.org");
      return (
        url.protocol === "https:" &&
        (value.startsWith("https://") ||
          (value.startsWith("/") && url.origin === "https://oclr.org"))
      );
    } catch {
      return false;
    }
  });
const turn = z.object({
  questionId: id,
  question: z.string().min(1).max(1500),
  answerId: id,
  answer: z.string().min(1).max(16000),
  sources: z
    .array(
      z.object({
        type: z.literal("source-url"),
        sourceId: id,
        url: sourceUrl,
        title: z.string().max(512).optional(),
      }),
    )
    .max(32),
});
const history = z.array(turn).max(turnLimit);

function readTurns(key: string): z.infer<typeof history> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 2_000_000) return [];
    return history.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function restoreLiruHistory(key: string): UIMessage[] {
  return readTurns(key).flatMap((turn): UIMessage[] => [
    {
      id: turn.questionId,
      role: "user",
      parts: [{ type: "text", text: turn.question }],
    },
    {
      id: turn.answerId,
      role: "assistant",
      parts: [{ type: "text", text: turn.answer }, ...turn.sources],
    },
  ]);
}

export function saveLiruTurn(key: string, messages: UIMessage[]) {
  const question = messages.at(-2);
  const answer = messages.at(-1);
  if (question?.role !== "user" || answer?.role !== "assistant") return;
  const result = turn.safeParse({
    questionId: question.id,
    question: messageText(question),
    answerId: answer.id,
    answer: messageText(answer),
    sources: answer.parts
      .filter(
        (p) => p.type === "source-url" && sourceUrl.safeParse(p.url).success,
      )
      .slice(0, 32),
  });
  if (!result.success) return;
  try {
    // Re-read before appending so an inactive tab never writes its entire stale transcript.
    const turns = readTurns(key).filter((t) => t.questionId !== question.id);
    localStorage.setItem(
      key,
      JSON.stringify([...turns, result.data].slice(-turnLimit)),
    );
  } catch {
    // Storage may be disabled or full. The active chat stays available.
  }
}

export function clearLiruHistory(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // The active chat can still be cleared when storage is unavailable.
  }
}
