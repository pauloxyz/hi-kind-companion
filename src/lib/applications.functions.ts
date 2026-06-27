import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CoverLetterInput = z.object({ jobId: z.string().uuid() });
const RecordApplicationInput = z.object({
  jobId: z.string().uuid(),
  coverLetterEn: z.string().min(1),
  contactMethod: z.string().default("email"),
  attachedMediaIds: z.array(z.string().uuid()).optional(),
  attachedVideoId: z.string().uuid().nullable().optional(),
});

export const generateCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CoverLetterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: job }, { data: profile }, { data: resume }, { data: experiences }, { data: featuredMedia }, { data: video }] =
      await Promise.all([
        supabase.from("jobs").select("*").eq("id", data.jobId).maybeSingle(),
        supabase.from("my_profile").select("*").eq("owner_id", userId).maybeSingle(),
        supabase.from("resumes").select("*").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("resume_experiences").select("*").eq("owner_id", userId).order("sort_order", { ascending: true }),
        supabase.from("work_media").select("id,media_url,media_type,caption").eq("owner_id", userId).eq("is_featured", true).order("uploaded_at", { ascending: false }).limit(6),
        supabase.from("intro_video").select("id,video_url").eq("owner_id", userId).eq("is_active", true).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

    if (!job) throw new Error("Vaga não encontrada");

    const profileLines = [
      profile?.full_name && `Name: ${profile.full_name}`,
      profile?.country && `Country: ${profile.country}`,
      profile?.phone && `Phone: ${profile.phone}`,
      profile?.has_prior_h2_experience && "Previous H-2 visa experience: yes",
      profile?.languages?.length ? `Languages: ${(profile.languages as string[]).map((l) => {
        const [code, level] = l.split(":");
        const map: Record<string, string> = { basic: "Basic", intermediate: "Intermediate", advanced: "Advanced", fluent: "Fluent", native: "Native" };
        return level ? `${code} (${map[level] ?? level})` : code;
      }).join(", ")}` : null,
      (() => {
        const t = (resume as { availability_type?: string | null } | null)?.availability_type;
        const map: Record<string, string> = {
          full_season: "Availability: Full season (entire H-2A contract)",
          half_season: "Availability: Half season",
          peak_harvest: "Availability: Peak harvest only (short-term)",
          year_round: "Availability: Year-round / open to multiple contracts",
          flexible: "Availability: Flexible / as needed",
        };
        if (t && map[t]) return map[t];
        if (resume?.availability_start && resume?.availability_end) return `Available from ${resume.availability_start} until ${resume.availability_end}`;
        if (resume?.availability_start) return `Available from ${resume.availability_start}`;
        return null;
      })(),
      resume?.summary_en && `Summary: ${resume.summary_en}`,
    ].filter(Boolean).join("\n");

    const expLines = (experiences ?? []).slice(0, 6).map(
      (e) => `- ${e.job_title_en ?? e.job_title ?? ""} at ${e.employer_name ?? ""} (${e.start_date ?? "?"} → ${e.end_date ?? "present"}): ${e.description_en ?? e.description_pt ?? ""}`,
    ).join("\n");

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

    let letter = "";
    try {
      const { text } = await generateText({ model: gateway("google/gemini-3-flash-preview"), prompt });
      letter = text.trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("Limite de IA atingido. Tente novamente em alguns minutos.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error("Falha ao gerar carta: " + msg);
    }

    // Build attachment footer. Prefer the public profile URL when available — one short link beats raw signed Storage URLs.
    const EXPIRES = 60 * 60 * 24 * 30;
    const footer: string[] = [];
    const attachedMediaIds: string[] = [];
    let attachedVideoId: string | null = null;

    if (profile?.public_slug && profile?.public_page_enabled) {
      const { getRequestHost } = await import("@tanstack/react-start/server");
      let host = "";
      try { host = getRequestHost(); } catch { host = ""; }
      const origin = host ? `https://${host}` : "";
      footer.push(`Full candidate profile (video + photos + experience): ${origin}/v/${profile.public_slug}`);
      if (video) attachedVideoId = video.id;
      for (const m of featuredMedia ?? []) attachedMediaIds.push(m.id);
    } else {
      if (video) {
        const { data: signed } = await supabase.storage.from("intro-videos").createSignedUrl(video.video_url, EXPIRES);
        if (signed) { footer.push(`Intro video (English): ${signed.signedUrl}`); attachedVideoId = video.id; }
      }
      if (featuredMedia && featuredMedia.length) {
        const mediaLines: string[] = [];
        for (const m of featuredMedia) {
          const { data: signed } = await supabase.storage.from("work-media").createSignedUrl(m.media_url, EXPIRES);
          if (signed) {
            mediaLines.push(`- ${m.caption ?? "Work sample"}: ${signed.signedUrl}`);
            attachedMediaIds.push(m.id);
          }
        }
        if (mediaLines.length) { footer.push("Work photos / videos:"); footer.push(...mediaLines); }
      }
    }

    const finalText = footer.length ? `${letter}\n\n---\nReferences:\n${footer.join("\n")}` : letter;
    return { text: finalText, job, attachedMediaIds, attachedVideoId };
  });

export const recordApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordApplicationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const followUp = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: job } = await supabase.from("jobs").select("employer_name").eq("id", data.jobId).maybeSingle();
    let employerId: string | null = null;
    if (job?.employer_name) {
      const { data: emp } = await supabase.from("employers")
        .upsert({ owner_id: userId, employer_name: job.employer_name }, { onConflict: "owner_id,employer_name" })
        .select("id").maybeSingle();
      employerId = emp?.id ?? null;
    }

    const { data: app, error } = await supabase.from("applications").insert({
      owner_id: userId,
      job_id: data.jobId,
      employer_id: employerId,
      cover_letter_en: data.coverLetterEn,
      contact_method: data.contactMethod,
      status: "sent",
      follow_up_due_at: followUp,
      attached_media_ids: data.attachedMediaIds ?? [],
      attached_video_id: data.attachedVideoId ?? null,
    }).select("id").single();

    if (error) throw new Error(error.message);
    return { id: app.id, followUpDueAt: followUp };
  });
