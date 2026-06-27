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
    job_title_en: string;
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

    const schemaInstructions = `Você é um especialista em recrutamento H-2A (visto agrícola sazonal nos EUA) ajudando um candidato brasileiro a adaptar o currículo dele para empregadores americanos do agronegócio. Sua missão é LER o currículo com inteligência e POSICIONAR cada experiência da forma mais ASSERTIVA possível para maximizar as chances de contratação — sem mentir, sem inventar, mas escolhendo o ângulo certo.

CONTEXTO DO H-2A:
- A vaga é para executar trabalho agrícola (colheita, plantio, irrigação, manejo, operação de equipamentos, pecuária, etc.).
- Empregadores valorizam: experiência prática em campo, confiabilidade, disposição física, conhecimento de cultivos/animais, capacidade de operar máquinas, trabalho em equipe.
- Dois extremos a evitar:
  1) OVERSKILL: descrever-se como "engenheiro", "gerente", "supervisor", "pesquisador", "consultor" — empregadores assumem que a pessoa não vai aceitar trabalho braçal ou vai sair rápido.
  2) UNDERSELL: apagar toda a experiência técnica e parecer alguém sem nenhuma familiaridade com o setor agrícola — também reduz chances.

EQUILÍBRIO CORRETO (use bom senso, analise o currículo inteiro antes de decidir):
- Se a pessoa tem formação técnica/superior em área agrícola, NÃO esconda o conhecimento — apenas reposicione o CARGO e as ATIVIDADES para o lado prático e executável.
- Traduza títulos acadêmicos/gerenciais para funções operacionais equivalentes que descrevam o que a pessoa REALMENTE FAZIA NO DIA A DIA:
  • "Engenheiro Agrônomo" supervisionando colheita → "Agricultural Field Technician" ou "Crop Production Worker" (descreva: operou colheitadeira, aplicou defensivos, monitorou irrigação, acompanhou plantio)
  • "Gerente de Fazenda" → "Experienced Farm Hand" (descreva: rotina diária com gado, manejo de pastagem, manutenção de cercas, operação de trator)
  • "Técnico Agrícola" → "Agricultural Worker" (descreva: tarefas práticas executadas)
- Skills: misture habilidades práticas (Tractor operation, Coffee harvest, Cattle handling, Irrigation, Pruning, Pesticide application, Equipment maintenance) com conhecimentos técnicos relevantes traduzidos de forma simples (Soil knowledge, Crop identification, Livestock care, Spray equipment). Evite termos de escritório/gestão (Management, Leadership, Consulting, Research, Project planning, Team coordination).
- summary_en e summary_pt: humildes mas confiantes, mostrando familiaridade com o setor + disposição para trabalho duro + experiência prática real. Sem jargão acadêmico, sem se gabar, sem títulos como "Eng." ou "Dr.". Foque em ANOS DE EXPERIÊNCIA EM CAMPO e CULTIVOS/ANIMAIS específicos com os quais já trabalhou.
- Descrições das experiências (description_pt e description_en): use verbos de AÇÃO PRÁTICA ("harvested", "operated", "planted", "irrigated", "pruned", "applied", "fed", "milked", "loaded", "maintained"). Evite verbos de gestão ("managed", "supervised", "coordinated", "led", "designed", "researched", "analyzed").
- Se uma experiência for puramente de escritório/acadêmica sem nenhum lado de campo, OMITA-A. Não force.
- job_title em PT deve ser realista e operacional ("Trabalhador agrícola", "Operador de trator", "Técnico de campo", "Tratorista", "Ajudante rural", "Trabalhador de fazenda"). Em inglês equivalente: "Farm Worker", "Field Technician", "Tractor Operator", "Ranch Hand", "Agricultural Worker".

Devolva APENAS JSON válido no formato:
{
  "full_name": string|null,
  "phone": string|null,
  "country": string|null,
  "summary_pt": string,  // 2-4 frases, humilde e direto, destacando anos de campo e cultivos/animais conhecidos
  "summary_en": string,  // mesma ideia em inglês simples e natural
  "skills": string[],    // 6-12 habilidades práticas em inglês simples (mistura de execução e conhecimento aplicado)
  "experiences": [
    {
      "job_title": string,        // em PT, reposicionado como função operacional
      "employer_name": string,
      "location": string,
      "start_date": "YYYY-MM-DD" | "",
      "end_date": "YYYY-MM-DD" | "",
      "description_pt": string,   // foco no que foi feito na prática, no campo
      "description_en": string    // mesma descrição em inglês simples, verbos de ação prática
    }
  ]
}
Regras finais:
- Datas: se não souber o dia, use o primeiro do mês. Se nem o mês, use "".
- Não invente experiências. Apenas REINTERPRETE as reais sob o ângulo mais assertivo para H-2A.
- Antes de devolver, releia mentalmente: "um fazendeiro americano leria isso e pensaria 'essa pessoa sabe o que faz no campo E vai aceitar o trabalho'?" Se não, ajuste.
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
            job_title_en: (e as { job_title_en?: string }).job_title_en ?? "",
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
