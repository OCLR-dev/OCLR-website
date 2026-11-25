import type { UIMessage } from "ai";

export const maxRecentQuestions = 4;
export const maxPreviousAnswerLength = 2000;

export function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

// Call only with restored or successfully completed pairs. A partial stream
// can leave text in the visible thread even when the request failed.
export function rememberCompletedAnswer(
  answers: Map<string, string>,
  question?: UIMessage,
  reply?: UIMessage,
) {
  if (question?.role !== "user" || reply?.role !== "assistant") return;
  const text = messageText(reply).trim().slice(0, maxPreviousAnswerLength);
  if (!text) return;
  answers.delete(question.id);
  answers.set(question.id, text);
  if (answers.size > maxRecentQuestions)
    answers.delete(answers.keys().next().value!);
}

export function chatTurnContext(
  messages: UIMessage[],
  completed: Map<string, string>,
) {
  const recent = messages
    .filter((message) => message.role === "user")
    .slice(-maxRecentQuestions);
  return {
    questions: recent.map(messageText),
    previousAnswers: recent
      .slice(0, -1)
      .map((message) => completed.get(message.id) ?? null),
  };
}
