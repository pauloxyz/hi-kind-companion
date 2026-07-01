import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Standardized submit button for every auth form.
 *
 * A11y contract:
 *   - `aria-busy` reflects the loading state so assistive tech knows the
 *     button is waiting on a network round-trip.
 *   - The spinner is `aria-hidden` — the visible label is what screen
 *     readers announce (never a lone "..." or empty string).
 *   - `disabled` is set from `loading || disabled` so a slow network
 *     can't produce duplicate submissions.
 *
 * Loading label defaults to `"{label}…"` to keep copy consistent across
 * signin ("Entrando…"), signup ("Criando conta…") and reset
 * ("Enviando…") without each caller reinventing the phrasing.
 */
export function AuthSubmitButton({
  label,
  loadingLabel,
  loading,
  disabled = false,
}: {
  label: string;
  loadingLabel?: string;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      className="w-full h-11 text-base font-semibold"
      disabled={loading || disabled}
      aria-busy={loading}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      <span>{loading ? loadingLabel ?? `${label}…` : label}</span>
    </Button>
  );
}
