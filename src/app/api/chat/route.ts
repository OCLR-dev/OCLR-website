import { getAppTranslations } from "@/i18n/server";
import { formatTechnicalReply } from "@/lib/chat-technical-reply";
import { requireBrowserSession } from "@/lib/auth/user";
import { apiError, readJson, requireSameOrigin } from "@/lib/http";
import { chatConfiguration } from "@/lib/chat-config";
import { readChatPrompt } from "@/lib/chat-prompt-settings";
import { formatSeasonCount } from "@/lib/chat-season-counts";
import { chatRequestBlockReason } from "@/lib/chat-request-filter";
import { chatAnswer, chatScopeReply, chatTextReply } from "@/lib/chat-answer";
import { createChatTrace, safeChatError } from "@/lib/chat-trace";
import { chatWrite } from "@/lib/chat-write-contract";
import { chatEvidence } from "@/lib/chat-sources";
import { selfPlayerRequest } from "@/lib/chat-player-profile";
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
      .filter(
        (turn) =>
          !chatRequestBlockReason(turn.question) &&
          selfPlayerRequest(turn.question) !== "identity",
      );
    const lastTurn = previousTurns.at(-1);
    const evidence = await chatEvidence(
      edition,
      question,
      lastTurn?.question ?? "",
      Date.now(),
      request.signal,
      (error) => trace("embedding_fallback", undefined, safeChatError(error)),
      lastTurn?.answer ?? "",
      session.osuId,
    );
    if (evidence.blocked) {
      stage = "scope_filter";
      trace("question_blocked", undefined, {
        edition,
        reason: evidence.blocked,
      });
      return await chatScopeReply(diagnostics);
    }
    if (
      evidence.selfRequest === "identity" ||
      (evidence.selfRequest === "profile" && !evidence.sources.length)
    ) {
      const tr = await getAppTranslations(locale);
      request.signal.throwIfAborted();
      trace("evidence_ready", undefined, {
        edition,
        sourceCount: 0,
        retrievalMs: Math.round(performance.now() - retrievalStarted),
        route: "local_identity",
      });
      const name = session.username.replace(/([\\*_[\]<>`])/g, "\\$1");
      const text =
        evidence.selfRequest === "identity"
          ? tr("Signed in as ") +
            name +
            " · " +
            tr("osu! ID {value0}", { value0: String(session.osuId) })
          : evidence.seasonScope?.unavailable.length
            ? tr("Published data for this analysis is currently unavailable.")
            : tr(
                "Your OCLR profile is available after you have public tournament participation.",
              );
      return chatTextReply(diagnostics, "requester", text, []);
    }
    if (evidence.technical) {
      request.signal.throwIfAborted();
      const reply = formatTechnicalReply(
        evidence.technical,
        await getAppTranslations(locale),
      );
      trace("evidence_ready", undefined, {
        edition,
        sourceCount: reply.sources.length,
        retrievalMs: Math.round(performance.now() - retrievalStarted),
        route: "technical_analysis",
        evidenceKind: "verified_analysis",
        analysisStatus: evidence.technical.status,
      });
      return chatTextReply(
        diagnostics,
        "technical-analysis",
        reply.text,
        reply.sources,
      );
    }
    if (evidence.total?.kind === "captains") {
      const tr = await getAppTranslations(locale);
      request.signal.throwIfAborted();
      trace("evidence_ready", undefined, {
        edition,
        sourceCount: 1,
        retrievalMs: Math.round(performance.now() - retrievalStarted),
        route: "local_count",
        evidenceKind: "verified_count",
      });
      return chatTextReply(
        diagnostics,
        "captain-count",
        formatSeasonCount(evidence.total, tr),
        [{ title: tr("Published captains"), url: evidence.total.source.url }],
      );
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
