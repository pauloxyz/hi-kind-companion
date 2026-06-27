import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CoverLetterInput = z.object({ jobId: z.string().uuid() });
const RecordApplicationInput = z.object({
  jobId: z.string().uuid(),
  coverLetterEn: z.string().min(1),
  contactMethod: z.string().default("email"),
});

export const generateCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CoverLetterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: job }, { data: profile }, { data: resume }, { data: experiences }] =
      await Promise.all([
        supabase.from("jobs").select("*").eq("id", data.jobId).maybeSingle(),
        supabase.from("my_profile").select("*").eq("owner_id", userId).maybeSingle(),
        supabase
          .from("resumes")
          .select("*")
          .eq("owner_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("resume_experiences")
          .select("*")
          .eq("owner_id", userId)
          .order("sort_order", { ascending: true }),
      ]);

    if (!job) throw new Error("Vaga não encontrada");

    const profileLines = [
      profile?.full_name && `Name: ${profile.full_name}`,
      profile?.country && `Country: ${profile.country}`,
      profile?.phone && `Phone: ${profile.phone}`,
      profile?.has_prior_h2_experience && "Previous H-2 visa experience: yes",
      profile?.languages?.length ? `Languages: ${profile.languages.join(", ")}` : null,
      resume?.availability_start && `Available from ${resume.availability_start}`,
      resume?.availability_end && `until ${resume.availability_end}`,
      resume?.summary_en && `Summary: ${resume.summary_en}`,
    ]
      .filter(Boolean)
      .join("\n");

    const expLines = (experiences ?? [])
      .slice(0, 6)
      .map(
        (e) =>
          `- ${e.job_title ?? ""} at ${e.employer_name ?? ""} (${e.start_date ?? "?"} → ${e.end_date ?? "present"}): ${e.description_en ?? e.description_pt ?? ""}`,
      )
      .join("\n");

    const prompt = `You are writing a short, sincere cover letter in ENGLISH for an H-2A seasonal farm worker job application. Tone: humble, direct, hard-working, no fluff. Max 180 words. Include: greeting using employer name if available; one sentence stating intent; 2-3 sentences of relevant farm/manual labor experience; one sentence about availability; closing with willingness to provide references/video and full legal name. Output ONLY the letter body, no subject line, no markdown.

JOB:
Title: ${job.job_title ?? ""}
Employer: ${job.employer_name ?? ""}
Location: ${[job.worksite_city, job.worksite_state].filter(Boolean).join(", ")}
Dates: ${job.start_date ?? "?"} to ${job.end_date ?? "?"}
Case: ${job.external_case_number ?? ""}

CANDIDATE:
${profileLines}

EXPERIENCE:
${expLines || "(no prior experience listed)"}
`;

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
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error("Falha ao gerar carta: " + msg);
    }
  });

export const recordApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordApplicationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const followUp = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    // Resolve or upsert employer for tracking
    const { data: job } = await supabase
      .from("jobs")
      .select("employer_name")
      .eq("id", data.jobId)
      .maybeSingle();

    let employerId: string | null = null;
    if (job?.employer_name) {
      const { data: emp } = await supabase
        .from("employers")
        .upsert(
          { owner_id: userId, employer_name: job.employer_name },
          { onConflict: "owner_id,employer_name" },
        )
        .select("id")
        .maybeSingle();
      employerId = emp?.id ?? null;
    }

    const { data: app, error } = await supabase
      .from("applications")
      .insert({
        owner_id: userId,
        job_id: data.jobId,
        employer_id: employerId,
        cover_letter_en: data.coverLetterEn,
        contact_method: data.contactMethod,
        status: "sent",
        follow_up_due_at: followUp,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: app.id, followUpDueAt: followUp };
  });
