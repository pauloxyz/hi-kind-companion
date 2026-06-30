import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

/**
 * Structured error message format the client can parse to drive
 * the retry banner. Format: `AI_ERR|<code>|<retry_after_sec>|<human msg>`.
 * Codes: `rate_limited` (429), `no_credits` (402), `bad_json`, `other`.
 */
function aiErr(code: string, msg: string, retryAfter = 0): Error {
  return new Error(`AI_ERR|${code}|${retryAfter}|${msg}`);
}

function extractRetryAfter(msg: string): number {
  // best effort: try to find "retry-after" or "Retry-After: N" or "after N seconds"
  const m = msg.match(/retry[-_ ]?after["':\s]+(\d+)/i) || msg.match(/(\d+)\s*seconds?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0 && n < 600) return n;
  }
  return 30;
}

/**
 * Call Lovable AI and parse the first JSON object out of the response.
 * Centralizes the 429/402 → structured error mapping the client uses to
 * render an actionable retry banner.
 */
export async function callJsonAI<T = unknown>(
  prompt: string,
  opts?: { model?: string; errorLabel?: string },
): Promise<T> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw aiErr("other", "Configuração da IA ausente. Avise o suporte.");
  const label = opts?.errorLabel ?? "resposta";
  const { generateText } = await import("ai");
  const gateway = createLovableAiGatewayProvider(key);

  let raw = "";
  try {
    const { text } = await generateText({
      model: gateway(opts?.model ?? "google/gemini-3-flash-preview"),
      prompt,
    });
    raw = text.trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429")) {
      throw aiErr(
        "rate_limited",
        "Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo — seu progresso não é perdido.",
        extractRetryAfter(msg),
      );
    }
    if (msg.includes("402")) {
      throw aiErr(
        "no_credits",
        "Os créditos de IA acabaram. Avise o administrador para recarregar — quando reabrir a página, é só clicar em Gerar de novo.",
      );
    }
    throw aiErr("other", `Falha ao gerar ${label}. Tente novamente em instantes.`);
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw aiErr("bad_json", `A IA respondeu fora do formato esperado (${label}). Tente gerar de novo.`);
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    throw aiErr("bad_json", `Não foi possível interpretar a ${label}. Tente gerar de novo.`);
  }
}
