/**
 * Pro feature flags
 *
 * Combina três fontes pra decidir se um usuário tem uma feature Pro:
 *   1) override individual em `pro_feature_overrides` (vence sempre)
 *   2) `is_pro(user)` — assinatura ativa OU admin
 *   3) `pro_features.enabled_for_pro` — flag global por feature
 *
 * Ler: qualquer usuário autenticado pega o próprio mapa via `getMyProFlags`.
 * Admin: lista catálogo, alterna flag global e gerencia overrides por usuário.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";
import { z } from "zod";

/* --------------------------------- types ---------------------------------- */

export type ProFeatureRow = {
  feature_key: string;
  label: string;
  description: string | null;
  enabled_for_pro: boolean;
  updated_at: string;
};

export type ProOverrideRow = {
  user_id: string;
  feature_key: string;
  enabled: boolean;
  note: string | null;
  created_at: string;
};

/* ----------------------- read: my effective flags ------------------------- */

export const getMyProFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, boolean>> => {
    // Catálogo
    const { data: feats, error: fErr } = await context.supabase
      .from("pro_features")
      .select("feature_key");
    if (fErr) throw new Error(fErr.message);
    const keys = (feats ?? []).map((f) => (f as { feature_key: string }).feature_key);
    if (keys.length === 0) return {};

    // Em vez de N RPC, faz um único loop usando is_pro_feature_enabled
    const result: Record<string, boolean> = {};
    await Promise.all(
      keys.map(async (k) => {
        const { data, error } = await context.supabase.rpc("is_pro_feature_enabled", {
          _user_id: context.userId,
          _feature_key: k,
        });
        if (error) throw new Error(error.message);
        result[k] = !!data;
      }),
    );
    return result;
  });

/* ------------------------------ admin: catálogo --------------------------- */

export const listProFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProFeatureRow[]> => {
    await assertAdminWithAudit(context as never, "admin/pro-features");
    const { data, error } = await context.supabase
      .from("pro_features")
      .select("feature_key,label,description,enabled_for_pro,updated_at")
      .order("label");
    if (error) throw new Error(error.message);
    return (data ?? []) as ProFeatureRow[];
  });

const UpdateInput = z.object({
  feature_key: z.string().min(1).max(80),
  enabled_for_pro: z.boolean(),
});

export const updateProFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdminWithAudit(context as never, "admin/pro-features:update");
    const { error } = await context.supabase
      .from("pro_features")
      .update({ enabled_for_pro: data.enabled_for_pro })
      .eq("feature_key", data.feature_key);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ------------------------------ admin: overrides -------------------------- */

const OverrideInput = z.object({
  user_id: z.string().uuid(),
  feature_key: z.string().min(1).max(80),
  enabled: z.boolean(),
  note: z.string().max(280).nullish(),
});

export const upsertProOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OverrideInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdminWithAudit(context as never, "admin/pro-features:override-set");
    const { error } = await context.supabase
      .from("pro_feature_overrides")
      .upsert(
        {
          user_id: data.user_id,
          feature_key: data.feature_key,
          enabled: data.enabled,
          note: data.note ?? null,
        } as never,
        { onConflict: "user_id,feature_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const DeleteInput = z.object({
  user_id: z.string().uuid(),
  feature_key: z.string().min(1).max(80),
});

export const deleteProOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdminWithAudit(context as never, "admin/pro-features:override-del");
    const { error } = await context.supabase
      .from("pro_feature_overrides")
      .delete()
      .eq("user_id", data.user_id)
      .eq("feature_key", data.feature_key);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listProOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProOverrideRow[]> => {
    await assertAdminWithAudit(context as never, "admin/pro-features:overrides");
    const { data, error } = await context.supabase
      .from("pro_feature_overrides")
      .select("user_id,feature_key,enabled,note,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as ProOverrideRow[];
  });
