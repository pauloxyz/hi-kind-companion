import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { GoogleIcon } from "./GoogleIcon";

/**
 * Google OAuth button with the same loading contract as AuthSubmitButton:
 *   - visible label always readable by screen readers (spinner is aria-hidden)
 *   - `aria-busy` while awaiting the OAuth redirect
 *   - disabled during flight to prevent double-clicks
 */
export function GoogleAuthButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-11 gap-2"
      disabled={loading}
      onClick={onClick}
      aria-busy={loading}
      aria-label="Continuar com Google"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GoogleIcon />}
      <span>{loading ? "Conectando…" : "Continuar com Google"}</span>
    </Button>
  );
}

/** Visual separator "ou com e-mail" shown between OAuth and email form. */
export function EmailSeparator() {
  return (
    <div className="relative" role="separator" aria-label="ou com e-mail">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase tracking-wider">
        <span className="bg-card px-2 text-muted-foreground">ou com e-mail</span>
      </div>
    </div>
  );
}
