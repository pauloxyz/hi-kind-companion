import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProFlags } from "@/lib/pro-features.functions";

/**
 * Hook único pra gating Pro no client.
 *
 * `flags` é o mapa autoritativo (combinando overrides + assinatura + flag global).
 * `has(key)` é a forma curta. Durante o load, `has` retorna `false` (fail-closed) —
 * UI não pisca conteúdo Pro pra usuário Free.
 */
export function usePro() {
  const fetchFlags = useServerFn(getMyProFlags);
  const q = useQuery({
    queryKey: ["pro", "my-flags"],
    queryFn: () => fetchFlags(),
    staleTime: 60_000,
  });
  const flags = q.data ?? {};
  return {
    flags,
    has: (key: string) => !!flags[key],
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
