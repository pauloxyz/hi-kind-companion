/**
 * Rate-limit helper backed by public.check_rate_limit(_key, _max, _window).
 *
 * Uses the service-role client (SECURITY DEFINER RPC is only callable by it).
 * Returns true when the request is allowed, false when it must be rejected.
 * Failures (DB unavailable, etc.) fail OPEN to avoid locking users out — the
 * limiter is defense-in-depth, not the only auth boundary.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: key,
      _max: max,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.warn("[rate-limit] rpc error", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.warn("[rate-limit] threw", e);
    return true;
  }
}

export class RateLimitError extends Error {
  constructor(message = "Muitas tentativas. Aguarde alguns minutos e tente novamente.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<void> {
  const ok = await checkRateLimit(key, max, windowSeconds);
  if (!ok) throw new RateLimitError();
}
