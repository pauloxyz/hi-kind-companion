// Pure, injectable orchestrator for the AI retry flow. The page wires real
// generators / sinks (telemetry, Sentry breadcrumbs, error capture); tests
// pass stubs and assert the exact events emitted. Keeping this side-effect
// free is what makes 429/402 telemetry covered by unit tests.

export type AiAction = "script" | "meta";

export type AiErrorCode = "rate_limited" | "no_credits" | "bad_json" | "other";

export type ParsedAiError = {
  code: AiErrorCode;
  retryAfter: number;
  msg: string;
};

/**
 * Parse the structured error string thrown by `ai-gateway.server.ts`:
 *   AI_ERR|<code>|<retry_after_sec>|<human msg>
 * Falls back to `{ code: "other", retryAfter: 0, msg: raw }` when unrecognized.
 */
export function parseAiError(err: unknown): ParsedAiError {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/^AI_ERR\|(\w+)\|(\d+)\|(.+)$/s);
  if (m) {
    return {
      code: m[1] as AiErrorCode,
      retryAfter: parseInt(m[2], 10) || 0,
      msg: m[3],
    };
  }
  return { code: "other", retryAfter: 0, msg: raw || "Erro inesperado." };
}

export type AiSinks = {
  track: (event: string, props: Record<string, unknown>) => void;
  breadcrumb: (
    message: string,
    data: Record<string, unknown> & { correlationId: string },
    level?: "info" | "warning" | "error",
  ) => void;
  capture: (err: unknown, tags: Record<string, unknown>, extra: Record<string, unknown>) => void;
  now: () => number;
};

export type AiAttemptInput<T> = {
  action: AiAction;
  isRetry: boolean;
  correlationId: string;
  /** Epoch ms when the banner transitioned to "ready" — used to compute waitedPastUnlockMs. 0 if N/A. */
  readyAt: number;
  /** Previous error code that drove this retry (used for telemetry context). */
  previousCode?: AiErrorCode;
  /**
   * Whether the banner is currently in its "ready" state. Defaults to true.
   * When `isRetry` is true after a `rate_limited` error and `bannerReady` is
   * false, the attempt is skipped — no telemetry click event, no generator
   * call — to prevent premature retries during the countdown window.
   */
  bannerReady?: boolean;
  generator: () => Promise<T>;
  sinks: AiSinks;
};

export type AiAttemptResult<T> =
  | { ok: true; value: T; latencyMs: number }
  | { ok: false; error: ParsedAiError; latencyMs: number }
  | { ok: false; skipped: "not_ready"; latencyMs: 0 };

/**
 * Run one AI generation attempt with full telemetry + Sentry breadcrumb
 * coverage. Caller decides what to do with the typed result; this function
 * doesn't touch React state or supabase.
 */
export async function runAiAttempt<T>(input: AiAttemptInput<T>): Promise<AiAttemptResult<T>> {
  const { action, isRetry, correlationId, readyAt, previousCode, generator, sinks } = input;
  const clickAt = sinks.now();

  if (isRetry) {
    const waitedPastUnlockMs = readyAt > 0 ? clickAt - readyAt : 0;
    sinks.track("ai_retry_click", {
      action, code: previousCode, correlationId, waitedPastUnlockMs,
    });
    sinks.breadcrumb("retry-click", { correlationId, action, code: previousCode, waitedPastUnlockMs });
  } else {
    sinks.track("ai_generate_click", { action, correlationId });
    sinks.breadcrumb("generate-click", { correlationId, action });
  }

  const startedAt = sinks.now();
  try {
    const value = await generator();
    const latencyMs = sinks.now() - startedAt;
    const event = isRetry ? "ai_retry_success" : "ai_generate_success";
    sinks.track(event, { action, latencyMs, correlationId });
    sinks.breadcrumb(isRetry ? "retry-success" : "generate-success", {
      correlationId, action, latencyMs,
    });
    return { ok: true, value, latencyMs };
  } catch (err) {
    const latencyMs = sinks.now() - startedAt;
    const parsed = parseAiError(err);
    sinks.track("ai_error", {
      action,
      code: parsed.code,
      retryAfter: parsed.retryAfter,
      latencyMs,
      correlationId,
    });
    sinks.breadcrumb(
      "ai-error",
      { correlationId, action, code: parsed.code, retryAfter: parsed.retryAfter, latencyMs },
      parsed.code === "no_credits" ? "error" : "warning",
    );
    sinks.capture(
      err,
      { ai_action: action, ai_code: parsed.code, correlation_id: correlationId },
      { retryAfter: parsed.retryAfter, latencyMs, msg: parsed.msg },
    );
    if (isRetry) {
      sinks.track("ai_retry_failure", { action, correlationId });
      sinks.breadcrumb("retry-failure", { correlationId, action, code: parsed.code });
    }
    return { ok: false, error: parsed, latencyMs };
  }
}
