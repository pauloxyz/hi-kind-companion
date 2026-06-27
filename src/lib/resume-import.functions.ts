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

    const schemaInstructions = `Você recebe um currículo (PDF, Word ou imagem). Extraia as informações e devolva APENAS JSON válido no formato:
{
  "full_name": string|null,
  "phone": string|null,
  "country": string|null,
  "summary_pt": string, // resumo profissional em português (2-4 frases). Se o currículo estiver em inglês, traduza.
  "summary_en": string, // mesmo resumo em inglês natural, estilo trabalho manual/agrícola dos EUA
  "skills": string[],   // habilidades em INGLÊS, curtas (ex: "Tractor operation", "Coffee harvest", "Irrigation")
  "experiences": [
    {
      "job_title": string,        // em português
      "employer_name": string,
      "location": string,
      "start_date": "YYYY-MM-DD" | "",
      "end_date": "YYYY-MM-DD" | "",  // vazio se for trabalho atual
      "description_pt": string,   // descrição em português
      "description_en": string    // mesma descrição em inglês natural
    }
  ]
}
Regras:
- Se não souber uma data exata, use o primeiro dia do mês (ex: "2020-03-01"). Se nem mês souber, use "".
- Não invente experiências; só inclua o que está no documento.
- Skills sempre em inglês, simples e diretas.
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
