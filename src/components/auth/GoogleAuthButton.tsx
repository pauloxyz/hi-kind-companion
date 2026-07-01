import { Button } from "@/components/ui/button";
import { GoogleIcon } from "./GoogleIcon";

/** OAuth button — parent owns loading state and click handler. */
export function GoogleAuthButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-11 gap-2"
      disabled={loading}
      onClick={onClick}
      aria-label="Continuar com Google"
    >
      <GoogleIcon />
      {loading ? "Conectando..." : "Continuar com Google"}
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
