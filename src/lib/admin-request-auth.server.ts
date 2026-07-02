/**
 * Guard de admin para SERVER ROUTES (raw HTTP) sob /api/admin/*.
 *
 * Diferente dos server fns (que usam requireSupabaseAuth + assertAdminWithAudit),
 * server routes recebem o Request cru e precisam:
 *   1) Extrair Bearer JWT do header Authorization.
 *   2) Validar o token via Supabase getClaims.
 *   3) Confirmar app_role='admin' via RPC has_role.
 *
 * Lança um Response HTTP (401/403/500) — o handler deve deixar propagar
 * para o runtime da TSS, que devolve exatamente esse Response ao browser.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminRequestClaims = {
  userId: string;
  token: string;
};

export async function assertAdminRequest(request: Request): Promise<AdminRequestClaims> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Response("Server misconfigured", { status: 500 });
  }

  const supabase = createClient<Database>(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: key,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const userId = data.claims.sub as string;

  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleErr) {
    throw new Response("Role check failed", { status: 500 });
  }
  if (!isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }

  return { userId, token };
}
