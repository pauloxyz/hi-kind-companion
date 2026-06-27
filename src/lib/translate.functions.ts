import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TranslateInput = z.object({
  texts: z.array(z.string()).min(1).max(20),
});

export const translateToEnglish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TranslateInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const numbered = data.texts.map((t, i) => `[${i + 1}] ${t}`).join("\n---\n");
    const prompt = `Translate the following Portuguese texts into clear, natural ENGLISH suitable for a manual-labor / agricultural worker resume in the United States. Keep it concrete, simple, and professional. Preserve numbering. Output ONLY the translated blocks separated by "---" on its own line, each prefixed with [N] matching the input.

INPUT:
${numbered}`;

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });
      const parts = text.split(/\n?---\n?/).map((s) => s.replace(/^\s*\[\d+\]\s*/, "").trim());
      // Pad/truncate to match input length
      const out = data.texts.map((_, i) => parts[i] ?? "");
      return { translations: out };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite de IA atingido.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados.");
      throw new Error("Falha na tradução: " + msg);
    }
  });
