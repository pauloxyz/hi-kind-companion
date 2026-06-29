import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ScriptBlock = {
  /** Tradução em PT-BR do bloco (curta, para o candidato entender). */
  pt: string;
  /** Frase/bloco em inglês para gravar. Máx ~12 palavras. */
  en: string;
  /** Pronúncia aproximada para um falante de português do Brasil. */
  phonetic: string;
};

/**
 * Gera um roteiro de vídeo de apresentação (PT-BR + EN) personalizado.
 * Retorna também `blocks`: o roteiro EN quebrado em frases curtas com
 * tradução PT e pronúncia "abrasileirada" para o candidato treinar bloco a bloco.
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

    const prompt = `You are writing a 45-60 second self-introduction video script for an H-2A seasonal farm worker visa applicant. The candidate is a NATIVE BRAZILIAN PORTUGUESE speaker who probably does not speak English well, so they need to memorize the English script chunk by chunk, and they need a PRONUNCIATION GUIDE written the way a Brazilian would spell out the sounds (NOT IPA).

You must produce THREE things:

1) "pt": full ~50 second script in BRAZILIAN PORTUGUESE (110-140 words) — what the candidate practices first to understand the meaning. Natural, warm, humble, confident — not robotic.

2) "en": full ENGLISH script (110-140 words) — clean continuous prose, no annotations, no slashes. This is the one they will record.

3) "blocks": the SAME English script broken into 10-16 short chunks, each one easy to memorize and say in one breath (max ~10 words). For EACH block return:
   - "en": the English chunk (verbatim — when concatenated in order they MUST reconstruct exactly the "en" field above)
   - "pt": short Brazilian Portuguese translation of that chunk
   - "phonetic": pronunciation written PHONETICALLY THE WAY A BRAZILIAN WOULD READ IT — use Portuguese spelling rules so the candidate can read it out loud. Examples:
       * "Hi, my name is John" → "Rái, mái nêimi is Djón"
       * "I worked with apples" → "Ái uórkti uífi épous"
       * "Thank you very much" → "Tchénk-iú véri mâtch"
     Mark the stressed syllable with an accent if it helps. Do NOT use IPA. Do NOT use English spelling.

CONTENT RULES (apply to pt + en):
- MUST mention at least one SPECIFIC crop, animal, or machine the candidate has actually worked with (pull from EXPERIENCE below). Do NOT invent.
- MUST mention years of experience based on EXPERIENCE dates.
- Structure: greeting + name + city/country → what they did on the farm (specific) → why hire them (work ethic, physical readiness, reliability) → ready to start and finish the full H-2A contract → thank you.
- NO clichés like "I am a hard worker passionate about agriculture". Be concrete.
- NO emojis, NO markdown, NO stage directions, NO slashes inside sentences.

Return EXACTLY this JSON and nothing else:
{
  "pt": "...",
  "en": "...",
  "blocks": [
    { "en": "...", "pt": "...", "phonetic": "..." }
  ]
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

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Resposta da IA não veio em JSON.");
    let parsed: { pt?: string; en?: string; blocks?: ScriptBlock[] };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("Não foi possível interpretar o roteiro gerado.");
    }
    const pt = (parsed.pt ?? "").trim();
    const en = (parsed.en ?? "").trim();
    const blocks = Array.isArray(parsed.blocks)
      ? parsed.blocks
          .map((b) => ({
            en: String(b?.en ?? "").trim(),
            pt: String(b?.pt ?? "").trim(),
            phonetic: String(b?.phonetic ?? "").trim(),
          }))
          .filter((b) => b.en && b.pt && b.phonetic)
      : [];
    if (!pt || !en) throw new Error("Roteiro veio incompleto. Tente novamente.");
    if (blocks.length < 4) throw new Error("Os blocos de pronúncia vieram incompletos. Tente gerar de novo.");

    await supabase
      .from("my_profile")
      .update({
        video_script_pt: pt,
        video_script_en: en,
        video_script_blocks: blocks as never,
        video_script_generated_at: new Date().toISOString(),
      })
      .eq("owner_id", userId);

    return { pt, en, blocks };
  });

const YT_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

export function normalizeYouTubeUrl(input: string): string | null {
  const m = input.match(YT_REGEX);
  if (!m) return null;
  return `https://youtu.be/${m[1]}`;
}
