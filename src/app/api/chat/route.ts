import { requireBrowserSession } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { chatConfiguration } from "@/lib/chat-config";
import { readChatPrompt } from "@/lib/chat-prompt-settings";
import { chatRequestBlockReason } from "@/lib/chat-request-filter";
import { chatAnswer, chatScopeReply } from "@/lib/chat-answer";
import { createChatTrace, safeChatError } from "@/lib/chat-trace";
import { chatWrite } from "@/lib/chat-write-contract";
import { chatEvidence } from "@/lib/chat-sources";
import { DeveloperApiError, DeveloperApiLimiter } from "@/lib/developer-api";

const limiter = new DeveloperApiLimiter();

export async function POST(request: Request) {
  const diagnostics = createChatTrace();
  const { headers, trace } = diagnostics;
  let stage = "session";
  try {
    const session = await requireBrowserSession();
    stage = "origin";
    requireSameOrigin(request);
    stage = "configuration";
    const config = chatConfiguration();
    if (!config) {
      trace("request_rejected", 503, { stage });
      return Response.json(
        { error: "Chat is unavailable." },
        { status: 503, headers },
      );
    }
    stage = "validation";
    const input = chatWrite.request.safeParse(
      await readJson(request, chatWrite.maxBodyBytes),
    );
    if (!input.success) {
      trace("request_rejected", 400, { stage });
      return Response.json(
        { error: "Invalid chat request." },
        { status: 400, headers },
      );
    }
    const { edition, locale, questions } = input.data;
    trace("request_validated", undefined, {
      locale,
      questionCount: questions.length,
    });
    stage = "rate_limit";
    limiter.take(String(session.osuId), 8);
    stage = "retrieval";
    const retrievalStarted = performance.now();
    const question = questions.at(-1)!;
    const previousTurns = questions
      .slice(0, -1)
      .map((question, i) => ({
        question,
        answer: input.data.previousAnswers?.[i] ?? null,
      }))
      .filter((turn) => !chatRequestBlockReason(turn.question));
    const lastTurn = previousTurns.at(-1);
    const evidence = await chatEvidence(
      edition,
      question,
      lastTurn?.question ?? "",
      Date.now(),
      request.signal,
      (error) => trace("embedding_fallback", undefined, safeChatError(error)),
      lastTurn?.answer ?? "",
    );
    if (evidence.blocked) {
      stage = "scope_filter";
      trace("question_blocked", undefined, {
        edition,
        reason: evidence.blocked,
      });
      return await chatScopeReply(diagnostics);
    }
    const evidenceKind = evidence.greeting
      ? "greeting"
      : evidence.total
        ? "verified_count"
        : evidence.sources.length
          ? "published"
          : "none";
    trace("evidence_ready", undefined, {
      edition,
      sourceCount: evidence.sources.length,
      retrievalMs: Math.round(performance.now() - retrievalStarted),
      route: "model",
      evidenceKind,
    });
    stage = "prompt_settings";
    const settings = await readChatPrompt();
    trace("prompt_ready", undefined, {
      customPrompt: Boolean(settings.prompt),
      promptRevision: settings.revision,
      maxOutputTokens: settings.maxOutputTokens,
    });
    stage = "response";
    request.signal.throwIfAborted();
    return chatAnswer({
      diagnostics,
      assistantPrompt: settings.prompt,
      maxOutputTokens: settings.maxOutputTokens,
      config,
      evidence,
      locale,
      question,
      previousTurns,
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof DeveloperApiError && error.status === 429) {
      trace("request_rejected", 429, { stage });
      return Response.json(
        { error: "Too many chat requests." },
        {
          status: 429,
          headers: { ...headers, "Retry-After": "60" },
        },
      );
    }
    const response = apiError(error);
    trace(
      request.signal.aborted
        ? "cancelled"
        : response.status >= 500
          ? "request_failed"
          : "request_rejected",
      response.status,
      { stage, ...safeChatError(error) },
    );
    for (const [name, value] of Object.entries(headers))
      response.headers.set(name, value);
    return response;
  }
}
