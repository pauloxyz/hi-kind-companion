import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Gera um roteiro de vídeo de apresentação (PT-BR + EN) personalizado
 * com base no perfil + experiências do usuário. ~45-60 segundos falados.
 */
export const generateVideoScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: experiences }, { data: skills }] = await Promise.all([
      supabase.from("my_profile").select("*").eq("owner_id", userId).maybeSingle(),
      supabase
        .from("resume_experiences")
        .select("job_title, job_title_en, employer_name, start_date, end_date, description_pt, description_en")
        .eq("owner_id", userId)
        .order("sort_order", { ascending: true })
        .limit(6),
      supabase.from("resume_skills").select("skill_name").eq("owner_id", userId).limit(20),
    ]);

    const name = profile?.full_name?.trim() || "[seu nome]";
    const country = profile?.country?.trim() || "Brazil";
    const phone = profile?.phone?.trim();

    const expLines = (experiences ?? [])
      .map((e) => {
        const title = e.job_title_en || e.job_title || "";
        const place = e.employer_name || "";
        const period = [e.start_date, e.end_date].filter(Boolean).join(" – ");
        const desc = e.description_en || e.description_pt || "";
        return `- ${title} at ${place} (${period}): ${desc}`;
      })
      .join("\n");

    const skillsLine = (skills ?? [])
      .map((s) => s.skill_name)
      .filter(Boolean)
      .join(", ");

    const prompt = `You are writing a 45-60 second self-introduction video script for an H-2A seasonal farm worker visa applicant. Output TWO versions: one in BRAZILIAN PORTUGUESE (pt-BR) and one in ENGLISH.

Rules — VERY IMPORTANT:
- Spoken length: ~45-60 seconds in each language (about 110-140 words).
- Tone: humble, direct, warm, confident — NOT robotic or generic.
- MUST mention at least one SPECIFIC crop, animal, or machine the candidate has actually worked with (pull from EXPERIENCE below). Do NOT invent.
- MUST say years of experience based on EXPERIENCE dates.
- Structure: 1) greeting + name + age (if known) + city/country; 2) what they have done on the farm (specific); 3) why an American employer should hire them (work ethic, physical readiness, reliability); 4) closing — ready to start, committed to finishing the full H-2A contract, thank you.
- NO clichés like "I am a hard worker passionate about agriculture". Be concrete.
- NO emojis, NO markdown, NO stage directions.

Return EXACTLY this JSON shape and nothing else:
{
  "pt": "texto em português completo aqui...",
  "en": "complete english text here..."
}

CANDIDATE:
Name: ${name}
Country: ${country}
${phone ? `Phone: ${phone}` : ""}
Skills: ${skillsLine || "(none listed)"}

EXPERIENCE:
${expLines || "(no experience listed — use generic farm worker phrasing, but still mention being ready to learn any crop)"}
`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    let raw = "";
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });
      raw = text.trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite de IA atingido. Tente novamente em alguns minutos.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados.");
      throw new Error("Falha ao gerar roteiro: " + msg);
    }

    // Extrai o JSON do retorno (modelo às vezes vem com ```json ... ```)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Resposta da IA não veio em JSON.");
    let parsed: { pt?: string; en?: string };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("Não foi possível interpretar o roteiro gerado.");
    }
    const pt = (parsed.pt ?? "").trim();
    const en = (parsed.en ?? "").trim();
    if (!pt || !en) throw new Error("Roteiro veio incompleto. Tente novamente.");

    // Persistir no perfil
    await supabase
      .from("my_profile")
      .update({
        video_script_pt: pt,
        video_script_en: en,
        video_script_generated_at: new Date().toISOString(),
      })
      .eq("owner_id", userId);

    return { pt, en };
  });

const YT_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

export function normalizeYouTubeUrl(input: string): string | null {
  const m = input.match(YT_REGEX);
  if (!m) return null;
  return `https://youtu.be/${m[1]}`;
}
