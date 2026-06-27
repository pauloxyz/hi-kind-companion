import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  fileBase64: z.string().min(100),
  mimeType: z.string().default("application/pdf"),
  filename: z.string().default("resume.pdf"),
});

export type ImportedResume = {
  full_name?: string;
  phone?: string;
  country?: string;
  summary_pt: string;
  summary_en: string;
  skills: string[];
  experiences: Array<{
    job_title: string;
    employer_name: string;
    location: string;
    start_date: string; // YYYY-MM-DD or ""
    end_date: string;
    description_pt: string;
    description_en: string;
  }>;
};

export const importResumeFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ImportedResume> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const schemaInstructions = `Você recebe um currículo (PDF, Word ou imagem) de um candidato brasileiro ao visto H-2A (trabalho agrícola sazonal nos EUA). O H-2A é destinado a TRABALHADORES RURAIS BRAÇAIS — colheita, plantio, irrigação, operação de tratores, manejo de gado, poda, etc. NÃO é para cargos técnicos, gerenciais, de engenharia agronômica, supervisão, pesquisa ou escritório.

REGRA CRÍTICA — EVITAR "OVERSKILL":
Empregadores H-2A REJEITAM candidatos que pareçam superqualificados (engenheiros agrônomos, técnicos agrícolas, gerentes de fazenda, supervisores, consultores, pesquisadores). Eles querem mão de obra, não cérebro. Sua função é REPOSICIONAR o histórico do candidato destacando APENAS a experiência prática de campo (hands-on field work), mesmo que o cargo original tenha sido técnico ou de gestão.

Como reposicionar:
- Se a pessoa foi "Engenheiro Agrônomo", traduza como "Farm Worker" / "Agricultural Field Worker" — descreva o que ela FEZ COM AS MÃOS (acompanhou colheita, operou maquinário, aplicou defensivos, irrigou), nunca o que ela supervisionou, planejou ou pesquisou.
- Remova títulos de chefia, gestão, consultoria, pesquisa, coordenação. Substitua por funções de execução.
- Skills devem ser BRAÇAIS e PRÁTICAS em inglês simples: "Coffee harvest", "Tractor operation", "Irrigation systems", "Cattle handling", "Pruning", "Pesticide application", "Manual planting", "Fence repair". NUNCA: "Team leadership", "Agronomic planning", "Crop consulting", "Research", "Management", "Project coordination".
- summary_en e summary_pt devem soar humildes, diretos, com foco em disposição para trabalho duro, experiência prática em campo e ética de trabalho. Sem jargão técnico/acadêmico, sem títulos acadêmicos.
- Mantenha apenas experiências relevantes a trabalho rural braçal. Se o candidato teve cargos de escritório, omita-os ou descreva apenas o lado prático/campo que existiu naquele período.
- NUNCA use as palavras "engineer", "manager", "supervisor", "consultant", "researcher", "specialist", "coordinator", "agronomist", "director" no resultado final (em PT use equivalentes braçais: "trabalhador rural", "operador", "ajudante de campo").

Devolva APENAS JSON válido no formato:
{
  "full_name": string|null,
  "phone": string|null,
  "country": string|null,
  "summary_pt": string, // 2-4 frases, humilde, foco em trabalho de campo
  "summary_en": string, // mesmo resumo em inglês simples (nível trabalhador rural)
  "skills": string[],   // habilidades BRAÇAIS em inglês simples
  "experiences": [
    {
      "job_title": string,        // em português, reposicionado como função braçal
      "employer_name": string,
      "location": string,
      "start_date": "YYYY-MM-DD" | "",
      "end_date": "YYYY-MM-DD" | "",
      "description_pt": string,
      "description_en": string
    }
  ]
}
Regras:
- Datas: se não souber o dia, use o primeiro do mês. Se nem o mês, use "".
- Não invente experiências, mas REINTERPRETE as existentes pelo ângulo braçal.
- Retorne SOMENTE o JSON, sem markdown, sem comentários.`;


    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: schemaInstructions },
            {
              type: "file",
              file: {
                filename: data.filename,
                file_data: `data:${data.mimeType};base64,${data.fileBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      if (resp.status === 429) throw new Error("Limite de IA atingido. Tente novamente em alguns minutos.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha ao ler currículo (${resp.status}): ${txt.slice(0, 300)}`);
    }

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    let parsed: ImportedResume;
    try {
      const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("A IA retornou um formato inválido. Tente outro arquivo.");
    }

    return {
      full_name: parsed.full_name ?? undefined,
      phone: parsed.phone ?? undefined,
      country: parsed.country ?? undefined,
      summary_pt: parsed.summary_pt ?? "",
      summary_en: parsed.summary_en ?? "",
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter(Boolean) : [],
      experiences: Array.isArray(parsed.experiences)
        ? parsed.experiences.map((e) => ({
            job_title: e.job_title ?? "",
            employer_name: e.employer_name ?? "",
            location: e.location ?? "",
            start_date: e.start_date ?? "",
            end_date: e.end_date ?? "",
            description_pt: e.description_pt ?? "",
            description_en: e.description_en ?? "",
          }))
        : [],
    };
  });
