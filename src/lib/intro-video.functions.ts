import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listIntroVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("intro_video").select("*").order("recorded_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createIntroVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { video_url: string; duration_seconds?: number; language?: string }) => input)
  .handler(async ({ data, context }) => {
    // Deactivate any previous active video
    await context.supabase.from("intro_video").update({ is_active: false })
      .eq("owner_id", context.userId).eq("is_active", true);
    const { data: row, error } = await context.supabase.from("intro_video").insert({
      owner_id: context.userId,
      video_url: data.video_url,
      duration_seconds: data.duration_seconds ?? null,
      language: data.language ?? "en",
      is_active: true,
    }).select().single();
    if (error) throw error;
    return row;
  });

export const setActiveIntroVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase.from("intro_video").update({ is_active: false }).eq("owner_id", context.userId);
    const { error } = await context.supabase.from("intro_video").update({ is_active: true }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteIntroVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; storage_path: string }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase.storage.from("intro-videos").remove([data.storage_path]);
    const { error } = await context.supabase.from("intro_video").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getIntroVideoSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("intro-videos").createSignedUrl(data.path, 60 * 60);
    if (error) throw error;
    return { url: signed.signedUrl };
  });
