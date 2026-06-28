import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Mark lesson complete ----------
export const markLessonComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { lessonId: string; quizCorrect?: number; quizTotal?: number }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("english_progress")
      .upsert(
        {
          user_id: userId,
          lesson_id: data.lessonId,
          completed_at: new Date().toISOString(),
          quiz_correct: data.quizCorrect ?? 0,
          quiz_total: data.quizTotal ?? 0,
        },
        { onConflict: "user_id,lesson_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- TTS (returns base64 mp3) ----------
export const speakText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; voice?: string }) => input)
  .handler(async ({ data }): Promise<{ audio: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const text = String(data.text ?? "").slice(0, 500);
    if (!text.trim()) throw new Error("Texto vazio");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice: data.voice ?? "alloy",
        response_format: "mp3",
        instructions:
          "Speak clearly and slowly in standard American English, like a teacher helping a beginner learner.",
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      if (resp.status === 429) throw new Error("Limite de IA atingido. Tente novamente em alguns minutos.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha no TTS (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const buf = await resp.arrayBuffer();
    const audio = Buffer.from(buf).toString("base64");
    return { audio };
  });

// ---------- AI tutor chat ----------
type ChatMsg = { role: "user" | "assistant"; content: string };

export const tutorChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { topic?: string; messages: ChatMsg[] }) => input)
  .handler(async ({ data }): Promise<{ reply: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const system = `Você é "Coach Sam", um tutor amigável de inglês para trabalhadores rurais brasileiros indo para os EUA com visto H-2A.

REGRAS:
- O usuário fala português; pode escrever em inglês ou misturar.
- Responda SEMPRE em duas partes curtas:
  1) Uma resposta natural em INGLÊS simples (1-2 frases).
  2) Em seguida, em PORTUGUÊS: a tradução da sua resposta + correção breve do inglês do usuário (se ele tentou) ou uma dica útil.
- Use vocabulário básico. Frases curtas. Sem gírias americanas obscuras.
- Foque no tema atual: ${data.topic ?? "conversação geral para trabalho H-2A"}.
- Se o usuário cometer erro grave, mostre a versão correta em inglês entre **asteriscos**.
- Seja encorajador. Nunca humilhe.
- NÃO use markdown além dos asteriscos. Sem listas, sem títulos.`;

    const messages = [
      { role: "system" as const, content: system },
      ...data.messages.slice(-12),
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      if (resp.status === 429) throw new Error("Limite de IA atingido. Tente novamente em alguns minutos.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha no chat (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = (json.choices?.[0]?.message?.content ?? "").trim();
    return { reply };
  });
