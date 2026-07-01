import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/**
 * Password reset form. When `sent` is true, replaces itself with a
 * confirmation status message (aria-live=polite). Parent owns state.
 */
export function AuthResetForm(props: {
  email: string;
  loading: boolean;
  sent: boolean;
  onEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { t } = useI18n();
  const { email, loading, sent, onEmail, onSubmit } = props;

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
    <form className="space-y-4" onSubmit={onSubmit} aria-label="Formulário de recuperação de senha">
      <div className="space-y-1.5">
        <Label htmlFor="email-reset">{t("email")}</Label>
        <Input
          id="email-reset"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
        {loading ? "Enviando…" : "Enviar link de recuperação"}
      </Button>
    </form>
  );
}
