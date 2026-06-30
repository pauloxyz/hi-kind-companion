import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { AppError } from "./errors";
import { withServerErrors } from "./server-error-handler";

const CoverLetterInput = z.object({ jobId: z.string().uuid() });
const RecordApplicationInput = z.object({
  jobId: z.string().uuid(),
  coverLetterEn: z.string().min(1),
  contactMethod: z.string().default("email"),
  attachedMediaIds: z.array(z.string().uuid()).optional(),
  attachedVideoId: z.string().uuid().nullable().optional(),
  gmailThreadId: z.string().nullable().optional(),
  gmailMessageId: z.string().nullable().optional(),
});

export const generateCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CoverLetterInput.parse(input))
  .handler(withServerErrors("applications.generate_cover_letter", async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: job }, { data: profile }, { data: resume }, { data: experiences }] =
      await Promise.all([
        supabase.from("jobs").select("*").eq("id", data.jobId).maybeSingle(),
        supabase.from("my_profile").select("*").eq("owner_id", userId).maybeSingle(),
        supabase.from("resumes").select("*").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("resume_experiences").select("*").eq("owner_id", userId).order("sort_order", { ascending: true }),
      ]);

    if (!job) {
      throw new AppError("Não encontramos essa vaga. Atualize a página e tente novamente.", {
        kind: "not_found",
        code: "applications.cover_letter.job_not_found",
      });
    }

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

AVAILABILITY RULES (very important):
- Say the candidate is available NOW / ready to start as soon as the visa/contract allows. Do NOT say "available from <date>" with a future date and do NOT repeat the job's start/end dates.
- If the candidate's availability description says "Full season", write "available for the full season".
- If it says "Half season", write "available for half of the season".
- If it says "Peak harvest only", write "available for the peak harvest period".
- If it says "Year-round", write "available year-round and open to multiple contracts".
- If it says "Flexible", write "available with a flexible schedule, as needed".
- If no availability info is given, just say "available immediately".

JOB:
Title: ${job.job_title ?? ""}
Employer: ${job.employer_name ?? ""}
Location: ${[job.worksite_city, job.worksite_state].filter(Boolean).join(", ")}
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

    // Build attachment footer. PDF do currículo já carrega as 6 fotos dentro,
    // então o footer só destaca: (a) link público do perfil OU (b) link do YouTube.
    const footer: string[] = [];
    const attachedMediaIds: string[] = [];
    const attachedVideoId: string | null = null;

    if (profile?.public_slug && profile?.public_page_enabled) {
      const { getRequestHost } = await import("@tanstack/react-start/server");
      let host = "";
      try { host = getRequestHost(); } catch { host = ""; }
      const origin = host ? `https://${host}` : "";
      footer.push(`Full candidate profile (video, photos, experience): ${origin}/v/${profile.public_slug}`);
    }

    const ytUrl = (profile as { youtube_video_url?: string | null } | null)?.youtube_video_url;
    if (ytUrl) {
      footer.push("");
      footer.push(`Watch my short introduction video (in English):`);
      footer.push(ytUrl);
      footer.push(`A 60-second video where I introduce myself and talk about my farm experience.`);
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
      gmail_thread_id: data.gmailThreadId ?? null,
      gmail_message_id: data.gmailMessageId ?? null,
    }).select("id").single();

    if (error) throw new Error(error.message);

    // Auto-complete onboarding the moment the first application is recorded.
    await supabase.from("my_profile")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("owner_id", userId)
      .is("onboarding_completed_at", null);

    return { id: app.id, followUpDueAt: followUp };
  });

// Check Gmail threads for any inbound reply on the user's pending applications.
// Marks responded_at when a thread has a message NOT sent by the user (i.e. inbound).
const CheckRepliesInput = z.object({}).optional();
export const checkApplicationReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckRepliesInput.parse(input ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) {
      return { checked: 0, newReplies: 0, error: "Gmail não conectado" };
    }
    const ownerEmail = (claims as { email?: string } | undefined)?.email?.toLowerCase() ?? "";

    // Fetch applications with a thread id and no response yet
    const { data: apps } = await supabase
      .from("applications")
      .select("id, gmail_thread_id, sent_at")
      .eq("owner_id", userId)
      .is("responded_at", null)
      .not("gmail_thread_id", "is", null)
      .order("sent_at", { ascending: false })
      .limit(50);

    if (!apps?.length) return { checked: 0, newReplies: 0 };

    let newReplies = 0;
    const nowIso = new Date().toISOString();

    for (const app of apps) {
      try {
        const res = await fetch(
          `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/threads/${app.gmail_thread_id}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmailKey } },
        );
        if (!res.ok) continue;
        const thread = (await res.json()) as {
          messages?: Array<{ id?: string; snippet?: string; internalDate?: string; payload?: { headers?: Array<{ name: string; value: string }> } }>;
        };
        const msgs = thread.messages ?? [];
        const inbound = msgs.find((m) => {
          const from = (m.payload?.headers ?? []).find((h) => h.name.toLowerCase() === "from")?.value ?? "";
          return ownerEmail && !from.toLowerCase().includes(ownerEmail);
        });
        if (inbound) {
          const from = (inbound.payload?.headers ?? []).find((h) => h.name.toLowerCase() === "from")?.value ?? null;
          const receivedAt = inbound.internalDate ? new Date(Number(inbound.internalDate)).toISOString() : nowIso;
          await supabase.from("applications")
            .update({
              responded_at: nowIso,
              status: "responded",
              last_reply_check_at: nowIso,
              reply_snippet: inbound.snippet ?? null,
              reply_from: from,
              reply_received_at: receivedAt,
            } as never)
            .eq("id", app.id);
          newReplies++;
        } else {
          await supabase.from("applications").update({ last_reply_check_at: nowIso }).eq("id", app.id);
        }
      } catch {
        // ignore individual failures
      }
    }

    return { checked: apps.length, newReplies };
  });
