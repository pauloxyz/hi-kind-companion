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
 * Call Lovable AI and parse the first JSON object out of the response.
 * Centralizes the 429/402 → friendly Portuguese error mapping.
 */
export async function callJsonAI<T = unknown>(
  prompt: string,
  opts?: { model?: string; errorLabel?: string },
): Promise<T> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
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
    if (msg.includes("429")) throw new Error("Limite de IA atingido. Tente novamente em alguns minutos.");
    if (msg.includes("402")) throw new Error("Créditos de IA esgotados.");
    throw new Error(`Falha ao gerar ${label}: ${msg}`);
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Resposta da IA não veio em JSON (${label}).`);
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    throw new Error(`Não foi possível interpretar a ${label}.`);
  }
}
