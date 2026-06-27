import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IdInput = z.object({ applicationId: z.string().uuid() });

export const generateFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: app } = await supabase
      .from("applications")
      .select(
        "id,cover_letter_en,sent_at,jobs(job_title,employer_name,worksite_state,worksite_city,recruitment_email,external_case_number),my_profile:owner_id(full_name)",
      )
      .eq("id", data.applicationId)
      .eq("owner_id", userId)
      .maybeSingle();

    if (!app) throw new Error("Candidatura não encontrada");
    const job = app.jobs;
    if (!job) throw new Error("Vaga associada não encontrada");

    const sentDate = app.sent_at ? new Date(app.sent_at).toISOString().slice(0, 10) : "recently";

    const prompt = `Write a SHORT, polite follow-up email in ENGLISH for an H-2A farm job application I already sent on ${sentDate}. Max 90 words. Tone: humble, brief, no pressure. Structure: 1) friendly reminder of my prior application; 2) restate strong interest and quick availability; 3) offer to send references or a short intro video; 4) thank-you closing. Output ONLY the email body. Do NOT include a subject line.

JOB: ${job.job_title ?? ""} at ${job.employer_name ?? ""} (${[job.worksite_city, job.worksite_state].filter(Boolean).join(", ")})
ORIGINAL LETTER (for context, do not repeat verbatim):
${app.cover_letter_en ?? ""}`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });
      return { text: text.trim(), job };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite de IA atingido. Tente novamente em alguns minutos.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados.");
      throw new Error("Falha ao gerar follow-up: " + msg);
    }
  });

export const markFollowUpSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("applications")
      .update({ follow_up_sent_at: new Date().toISOString() })
      .eq("id", data.applicationId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markResponded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("applications")
      .update({ responded_at: new Date().toISOString(), status: "responded" })
      .eq("id", data.applicationId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
