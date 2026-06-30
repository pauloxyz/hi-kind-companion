/**
 * Currículos múltiplos (Pro)
 *
 * Cada usuário pode ter variantes do próprio perfil — uma pra colheita, outra
 * pra packing, outra pra máquina, etc. Pode também subir um PDF pronto e usar
 * como currículo independente. A variante marcada como `is_active` é a usada
 * por padrão ao enviar via WhatsApp / link público.
 *
 * O gate Pro `multiple_resumes` é cobrado na UI (ProGate). Server fns aqui
 * confiam em RLS (`owner_id = auth.uid()`) — Pro/Free é decisão de produto.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ProfileVariant = {
  id: string;
  name: string;
  label: string | null;
  job_title_pt: string | null;
  job_title_en: string | null;
  summary_pt: string | null;
  summary_en: string | null;
  skills: string[];
  highlighted_experience_ids: string[];
  pdf_path: string | null;
  pdf_filename: string | null;
  source: "variant" | "upload";
  is_active: boolean;
  sort_order: number;
  updated_at: string;
};

const Upsert = z.object({
  id: z.string().uuid().nullish(),
  name: z.string().trim().min(2).max(60),
  label: z.string().trim().max(80).nullish(),
  job_title_pt: z.string().trim().max(120).nullish(),
  job_title_en: z.string().trim().max(120).nullish(),
  summary_pt: z.string().trim().max(2000).nullish(),
  summary_en: z.string().trim().max(2000).nullish(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  highlighted_experience_ids: z.array(z.string().uuid()).max(20).default([]),
  source: z.enum(["variant", "upload"]).default("variant"),
});

export const listMyVariants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileVariant[]> => {
    const { data, error } = await context.supabase
      .from("profile_variants")
      .select(
        "id,name,label,job_title_pt,job_title_en,summary_pt,summary_en,skills,highlighted_experience_ids,pdf_path,pdf_filename,source,is_active,sort_order,updated_at",
      )
      .eq("owner_id", context.userId)
      .order("is_active", { ascending: false })
      .order("sort_order")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      ...(r as ProfileVariant),
      skills: Array.isArray((r as { skills?: unknown }).skills)
        ? ((r as { skills: string[] }).skills)
        : [],
      highlighted_experience_ids: Array.isArray(
        (r as { highlighted_experience_ids?: unknown }).highlighted_experience_ids,
      )
        ? ((r as { highlighted_experience_ids: string[] }).highlighted_experience_ids)
        : [],
    }));
  });

export const upsertVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Upsert.parse(i))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    // Pro gate: enforça server-side via is_pro_feature_enabled
    const { data: allowed, error: gErr } = await context.supabase.rpc(
      "is_pro_feature_enabled",
      { _user_id: context.userId, _feature_key: "multiple_resumes" },
    );
    if (gErr) throw new Error(gErr.message);
    if (!allowed) {
      throw new Error("Múltiplos currículos é uma funcionalidade Pro.");
    }

    if (data.id) {
      const { error } = await context.supabase
        .from("profile_variants")
        .update({
          name: data.name,
          label: data.label ?? null,
          job_title_pt: data.job_title_pt ?? null,
          job_title_en: data.job_title_en ?? null,
          summary_pt: data.summary_pt ?? null,
          summary_en: data.summary_en ?? null,
          skills: data.skills,
          highlighted_experience_ids: data.highlighted_experience_ids,
          source: data.source,
        } as never)
        .eq("id", data.id)
        .eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: ins, error } = await context.supabase
      .from("profile_variants")
      .insert({
        owner_id: context.userId,
        name: data.name,
        label: data.label ?? null,
        job_title_pt: data.job_title_pt ?? null,
        job_title_en: data.job_title_en ?? null,
        summary_pt: data.summary_pt ?? null,
        summary_en: data.summary_en ?? null,
        skills: data.skills,
        highlighted_experience_ids: data.highlighted_experience_ids,
        source: data.source,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

const SetActive = z.object({ id: z.string().uuid() });

export const setActiveVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetActive.parse(i))
  .handler(async ({ context, data }) => {
    // 1) limpa qualquer ativa
    const { error: clearErr } = await context.supabase
      .from("profile_variants")
      .update({ is_active: false } as never)
      .eq("owner_id", context.userId)
      .eq("is_active", true);
    if (clearErr) throw new Error(clearErr.message);
    // 2) ativa a escolhida
    const { error } = await context.supabase
      .from("profile_variants")
      .update({ is_active: true } as never)
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const Remove = z.object({ id: z.string().uuid() });

export const deleteVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Remove.parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("profile_variants")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const Attach = z.object({
  id: z.string().uuid(),
  pdf_path: z.string().trim().min(3).max(500),
  pdf_filename: z.string().trim().min(1).max(200),
});

export const attachVariantPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Attach.parse(i))
  .handler(async ({ context, data }) => {
    // path obrigatoriamente sob a pasta do usuário (RLS storage também valida)
    if (!data.pdf_path.startsWith(`${context.userId}/`)) {
      throw new Error("Caminho de arquivo inválido.");
    }
    const { error } = await context.supabase
      .from("profile_variants")
      .update({ pdf_path: data.pdf_path, pdf_filename: data.pdf_filename } as never)
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
