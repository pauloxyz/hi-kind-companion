import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Lista as fotos marcadas como "do currículo", em ordem. Retorna URLs assinadas (30d). */
export const listResumePhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("work_media")
      .select("id, media_url, caption, resume_photo_order")
      .eq("owner_id", userId)
      .eq("is_resume_photo", true)
      .eq("media_type", "photo")
      .order("resume_photo_order", { ascending: true, nullsFirst: false })
      .limit(6);
    if (error) throw error;

    const EXPIRES = 60 * 60 * 24 * 30;
    const out: Array<{ id: string; url: string; caption: string | null }> = [];
    for (const m of data ?? []) {
      const { data: signed } = await supabase.storage
        .from("work-media")
        .createSignedUrl(m.media_url, EXPIRES);
      if (signed) out.push({ id: m.id, url: signed.signedUrl, caption: m.caption ?? null });
    }
    return out;
  });

const SetInput = z.object({
  ids: z.array(z.string().uuid()).max(6),
});

/** Define quais fotos compõem o currículo (até 6) e a ordem delas. */
export const setResumePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Limpa todas as flags antes
    const { error: clearErr } = await supabase
      .from("work_media")
      .update({ is_resume_photo: false, resume_photo_order: null })
      .eq("owner_id", userId)
      .eq("is_resume_photo", true);
    if (clearErr) throw clearErr;

    // Aplica nova ordem
    for (let i = 0; i < data.ids.length; i++) {
      const { error } = await supabase
        .from("work_media")
        .update({ is_resume_photo: true, resume_photo_order: i })
        .eq("id", data.ids[i])
        .eq("owner_id", userId);
      if (error) throw error;
    }
    return { ok: true, count: data.ids.length };
  });
