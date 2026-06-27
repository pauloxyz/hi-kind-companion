import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateHeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ headline: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const { supabase, userId } = context;

    const [{ data: profile }, { data: resume }, { data: exps }, { data: skills }] = await Promise.all([
      supabase.from("my_profile").select("full_name,country,has_prior_h2_experience").eq("owner_id", userId).maybeSingle(),
      supabase.from("resumes").select("summary_en,summary_pt").eq("owner_id", userId).maybeSingle(),
      supabase.from("resume_experiences").select("job_title,employer_name,location,start_date,end_date,description_en").eq("owner_id", userId).order("sort_order", { ascending: true }),
      supabase.from("resume_skills").select("skill_name").eq("owner_id", userId),
    ]);

    const context_payload = {
      full_name: profile?.full_name ?? "",
      country: profile?.country ?? "Brazil",
      has_prior_h2: !!profile?.has_prior_h2_experience,
      summary_en: resume?.summary_en ?? "",
      summary_pt: resume?.summary_pt ?? "",
      experiences: (exps ?? []).slice(0, 8),
      skills: (skills ?? []).map((s) => s.skill_name).filter(Boolean).slice(0, 20),
    };

    const prompt = `Você é um recrutador H-2A escrevendo a frase de apresentação (headline) de UMA LINHA EM INGLÊS para um trabalhador agrícola brasileiro. Será o primeiro contato com o empregador americano.

REGRAS:
- UMA frase, máximo 160 caracteres.
- Em inglês simples, natural e direto. Sem jargão acadêmico, sem títulos ("Mr.", "Eng.", "Dr.").
- Mostre: anos de experiência em campo + cultivos/animais/equipamentos com que trabalhou + disposição/disponibilidade.
- Foco em trabalho braçal agrícola (H-2A não é para gerente, engenheiro ou supervisor).
- Se já fez H-2 antes, mencione ("returning H-2A worker" ou similar).
- Verbos práticos: harvested, operated, worked with, experienced in.
- Sem exagero. Sem se gabar. Honesto e confiante.
- NÃO use markdown, aspas, prefixos. Devolva APENAS a frase em inglês.

DADOS DO CANDIDATO:
${JSON.stringify(context_payload, null, 2)}

Exemplos de boas headlines:
- "Hardworking Brazilian farmhand with 5 years of coffee and citrus harvest, tractor operation, available for full H-2A season."
- "Returning H-2A worker, 3 seasons in strawberry and apple harvest, reliable and ready to start anytime."
- "Experienced cattle handler from southern Brazil, 7 years on dairy and beef ranches, available year-round."

Agora gere a headline:`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      if (resp.status === 429) throw new Error("Limite de IA atingido. Tente novamente em alguns minutos.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha ao gerar headline (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let headline = (json.choices?.[0]?.message?.content ?? "").trim();
    headline = headline.replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ").trim();
    if (headline.length > 160) headline = headline.slice(0, 157).trimEnd() + "...";
    return { headline };
  });
