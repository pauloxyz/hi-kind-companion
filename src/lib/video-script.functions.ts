import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ScriptBlock = {
  /** Tradução em PT-BR do bloco (curta, para o candidato entender). */
  pt: string;
  /** Frase/bloco em inglês para gravar. Máx ~12 palavras. */
  en: string;
  /** Pronúncia aproximada para um falante de português do Brasil. */
  phonetic: string;
  /** Nota curta de entonação/ritmo (ex.: "pausa curta", "tom firme"). */
  intonation: string;
};

/**
 * Gera um roteiro de vídeo de apresentação (PT-BR + EN) personalizado.
 * Retorna também `blocks`: o roteiro EN quebrado em frases curtas com
 * tradução PT, pronúncia "abrasileirada" e notas de entonação.
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

    const prompt = `You are writing a 45-60 second self-introduction video script for an H-2A seasonal farm worker visa applicant. The candidate is a NATIVE BRAZILIAN PORTUGUESE speaker who probably does not speak English well, so they need to memorize the English script chunk by chunk with a PRONUNCIATION GUIDE written the way a Brazilian would spell out the sounds (NOT IPA).

Produce FOUR things:

1) "pt": full ~50 second script in BRAZILIAN PORTUGUESE (110-140 words). Natural, warm, humble, confident.

2) "en": full ENGLISH script (110-140 words). Clean continuous prose — no annotations, no slashes. This is what they record.

3) "blocks": the SAME English script split into 10-16 short chunks, each one say-able in one breath (max ~10 words). For EACH block:
   - "en": the English chunk (verbatim — concatenated in order they MUST reconstruct exactly the "en" field above)
   - "pt": short Brazilian Portuguese translation
   - "phonetic": pronunciation written the way a BRAZILIAN reads Portuguese spelling. Examples:
       * "Hi, my name is John" → "Rái, mái nêimi is Djón"
       * "I worked with apples" → "Ái uórkti uífi épous"
       * "Thank you very much" → "Tchénk-iú véri mâtch"
     Mark stressed syllables with accents. NO IPA. NO English spelling.
   - "intonation": one short Portuguese note about HOW to say it — rhythm, pauses, emphasis. Examples: "tom calmo, sorrindo", "pausa curta depois", "ênfase em 'three years'", "subir o tom no final (pergunta)", "voz firme, sem pressa". Max 8 words.

CONTENT RULES (pt + en):
- MUST mention at least one SPECIFIC crop, animal, or machine the candidate actually worked with (from EXPERIENCE). Do NOT invent.
- MUST mention years of experience based on EXPERIENCE dates.
- Structure: greeting + name + city/country → what they did on the farm (specific) → why hire them → ready to start and finish the full H-2A contract → thank you.
- NO clichés. NO emojis. NO markdown. NO stage directions in the prose.

Return EXACTLY this JSON and nothing else:
{
  "pt": "...",
  "en": "...",
  "blocks": [
    { "en": "...", "pt": "...", "phonetic": "...", "intonation": "..." }
  ]
}

CANDIDATE:
Name: ${name}
Country: ${country}
${phone ? `Phone: ${phone}` : ""}
Skills: ${skillsLine || "(none listed)"}

EXPERIENCE:
${expLines || "(no experience listed — use generic farm worker phrasing, but mention being ready to learn any crop)"}
`;

    const { callJsonAI } = await import("./ai-gateway.server");
    const parsed = await callJsonAI<{ pt?: string; en?: string; blocks?: ScriptBlock[] }>(
      prompt,
      { errorLabel: "roteiro" },
    );
    const pt = (parsed.pt ?? "").trim();
    const en = (parsed.en ?? "").trim();
    const blocks = Array.isArray(parsed.blocks)
      ? parsed.blocks
          .map((b) => ({
            en: String(b?.en ?? "").trim(),
            pt: String(b?.pt ?? "").trim(),
            phonetic: String(b?.phonetic ?? "").trim(),
            intonation: String(b?.intonation ?? "").trim() || "tom calmo, sem pressa",
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

/**
 * Fallback no client: se o roteiro veio sem blocos (gerado antes da feature),
 * quebra o EN em frases curtas para a página 2 do PDF não sair em branco.
 */
export function deriveFallbackBlocks(en: string): ScriptBlock[] {
  if (!en) return [];
  const sentences = en
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.map((s) => ({
    en: s,
    pt: "(regere o roteiro para ver a tradução)",
    phonetic: "(regere o roteiro para ver a pronúncia)",
    intonation: "tom calmo, pausa curta",
  }));
}

// ---------------- YouTube metadata + SRT ----------------

export type YoutubeMeta = {
  title: string;
  description: string;
  tags: string[];
  category: string;
  settings: string[];
};

/** Gera título, descrição, tags, categoria e configurações recomendadas para upload no YouTube. */
export const generateYoutubeMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("my_profile")
      .select("full_name, country, video_script_pt, video_script_en")
      .eq("owner_id", userId)
      .maybeSingle();

    const name = profile?.full_name?.trim() || "Candidato";
    const country = profile?.country?.trim() || "Brazil";
    const pt = (profile?.video_script_pt ?? "").trim();
    const en = (profile?.video_script_en ?? "").trim();
    if (!en || !pt) throw new Error("Gere o roteiro antes (Passo 1).");

    const prompt = `You are preparing YouTube upload metadata for an H-2A farm worker visa candidate's self-introduction video. The video is short (about 60 seconds) and meant to be sent privately to U.S. agricultural employers via an "Unlisted" link.

Candidate: ${name} (from ${country})

ENGLISH SCRIPT:
${en}

PORTUGUESE SCRIPT:
${pt}

Return ONLY this JSON (no markdown, no commentary):
{
  "title": "concise, professional video title in ENGLISH, max 70 chars, includes candidate first name + 'H-2A' + a hint of experience",
  "description": "5-8 line description in ENGLISH for the YouTube box. Start with one sentence intro. Then a short bullet list of experience highlights pulled from the script. End with a friendly line saying the candidate is ready to start work in the U.S. Plain text only — no markdown, no emojis.",
  "tags": ["10-15 lowercase tags relevant to H-2A, farm work, the crops/animals/machinery mentioned in the script, and the candidate's country"],
  "category": "People & Blogs",
  "settings": [
    "5-7 short Portuguese (PT-BR) instructions for the candidate to apply during upload",
    "MUST include: marcar como 'Não listado' (Unlisted), desativar comentários, marcar 'Não, este vídeo não é feito para crianças', idioma do vídeo: Inglês (Estados Unidos)"
  ]
}`;

    const { callJsonAI } = await import("./ai-gateway.server");
    const parsed = await callJsonAI<Partial<YoutubeMeta>>(prompt, { errorLabel: "metadados" });

    const title = String(parsed.title ?? "").trim().slice(0, 95) || `${name} — H-2A Introduction`;
    const description = String(parsed.description ?? "").trim() || en;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 15)
      : ["h-2a", "farm worker", "brazil", "agriculture"];
    const category = String(parsed.category ?? "People & Blogs").trim() || "People & Blogs";
    const settings = Array.isArray(parsed.settings)
      ? parsed.settings.map((s) => String(s).trim()).filter(Boolean)
      : [
          "Marcar visibilidade como 'Não listado' (Unlisted)",
          "Marcar 'Não, este vídeo não é feito para crianças'",
          "Desativar comentários",
          "Idioma do vídeo: Inglês (Estados Unidos)",
        ];

    return { title, description, tags, category, settings } satisfies YoutubeMeta;
  });

// ---------- SRT helpers (client-side) ----------

function srtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Gera um arquivo SRT a partir dos blocos.
 * Cada bloco recebe uma duração proporcional ao nº de palavras do EN
 * (~0.42s/palavra, mínimo 1.4s) seguida de uma pausa curta entre legendas.
 */
export function buildSrt(blocks: ScriptBlock[], lang: "en" | "pt", gapSec = 0.25): string {
  let t = 0.5; // pequena margem inicial
  const lines: string[] = [];
  blocks.forEach((b, i) => {
    const words = Math.max(1, (b.en || "").split(/\s+/).filter(Boolean).length);
    const dur = Math.max(1.4, words * 0.42);
    const start = t;
    const end = t + dur;
    const text = (lang === "en" ? b.en : b.pt).trim();
    lines.push(String(i + 1));
    lines.push(`${srtTime(start)} --> ${srtTime(end)}`);
    lines.push(text);
    lines.push("");
    t = end + gapSec;
  });
  return lines.join("\n");
}
