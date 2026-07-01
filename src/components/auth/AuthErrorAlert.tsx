import { AlertCircle } from "lucide-react";
import type { AuthUiError } from "@/lib/auth-errors";

/**
 * Inline error banner shown above auth forms.
 *
 * - `role="alert"` + `aria-live="assertive"` so screen readers announce
 *   the failure immediately (auth errors are blocking, not ambient).
 * - Uses design tokens (`bg-destructive/10`, `text-destructive`) — never
 *   arbitrary colors — so the alert stays legible in every theme.
 * - Focus is NOT stolen: the failing input keeps focus so the user can
 *   correct it without an extra Tab.
 *
 * Renders nothing when `error` is null; safe to mount unconditionally.
 */
export function AuthErrorAlert({ error }: { error: AuthUiError | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        <div className="font-semibold leading-tight">{error.title}</div>
        <div className="text-destructive/90 leading-snug">{error.description}</div>
      </div>
    </div>
  );
}
