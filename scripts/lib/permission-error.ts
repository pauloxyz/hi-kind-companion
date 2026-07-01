/**
 * PostgREST + Supabase surface "permission denied" in several shapes depending
 * on whether the role has any grant at all vs. RLS blocking the row vs. the
 * function/table not being visible in the API schema cache. Any of these
 * shapes is a valid "denied" outcome for the coherence probe.
 *
 * Shapes we treat as denial:
 *   - 42501         → SQL permission denied (no GRANT on function/table)
 *   - PGRST202      → PostgREST could not find the function (revoked)
 *   - "permission denied" / "insufficient" → generic RLS + role denials
 *   - "no function matches" / "not find the function" → schema cache miss
 */
export function isPermissionErrorShape(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42501" ||
    code === "PGRST202" ||
    msg.includes("permission denied") ||
    msg.includes("not find the function") ||
    msg.includes("no function matches") ||
    msg.includes("insufficient")
  );
}
