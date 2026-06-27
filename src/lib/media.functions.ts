import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("work_media")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    media_type: "photo" | "video";
    media_url: string;
    category: "agriculture" | "machinery" | "animals" | "general";
    caption?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("work_media")
      .insert({ ...data, owner_id: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; caption?: string; is_featured?: boolean; category?: string }) => input)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("work_media").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; storage_path?: string }) => input)
  .handler(async ({ data, context }) => {
    if (data.storage_path) {
      await context.supabase.storage.from("work-media").remove([data.storage_path]);
    }
    const { error } = await context.supabase.from("work_media").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getSignedMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("work-media")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw error;
    return { url: signed.signedUrl };
  });
