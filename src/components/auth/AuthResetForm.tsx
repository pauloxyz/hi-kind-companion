import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { AuthSubmitButton } from "./AuthSubmitButton";
import { AuthErrorAlert } from "./AuthErrorAlert";
import type { AuthUiError } from "@/lib/auth-errors";

/**
 * Password reset form. When `sent` is true, replaces itself with a
 * confirmation status message (aria-live=polite — non-blocking). Errors
 * render through the same AuthErrorAlert used by signin/signup so the
 * user sees consistent feedback across all three flows.
 */
export function AuthResetForm(props: {
  email: string;
  loading: boolean;
  sent: boolean;
  error: AuthUiError | null;
  onEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { t } = useI18n();
  const { email, loading, sent, error, onEmail, onSubmit } = props;

  if (sent) {
    return (
      <div
        className="rounded-md border border-border bg-muted/40 p-4 text-sm text-foreground"
        role="status"
        aria-live="polite"
      >
        Link enviado para <strong>{email}</strong>. Confira sua caixa de entrada e o spam.
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} aria-label="Formulário de recuperação de senha" noValidate>
      <AuthErrorAlert error={error} />

      <div className="space-y-1.5">
        <Label htmlFor="email-reset">{t("email")}</Label>
        <Input
          id="email-reset"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          required
          disabled={loading}
          aria-invalid={error?.bucket === "credentials" || undefined}
        />
      </div>
      <AuthSubmitButton
        label="Enviar link de recuperação"
        loadingLabel="Enviando…"
        loading={loading}
      />
    </form>
  );
}
