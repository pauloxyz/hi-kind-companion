import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordStrength, isPasswordAcceptable } from "@/components/PasswordStrength";
import { useI18n } from "@/lib/i18n";

/**
 * Email + password form used for both signin and signup.
 * Parent owns email/password state so the values survive mode toggles
 * (signup ↔ signin) without an intermediate reset.
 */
export function AuthEmailForm(props: {
  mode: "signin" | "signup";
  email: string;
  password: string;
  loading: boolean;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onForgot: () => void;
}) {
  const { t } = useI18n();
  const { mode, email, password, loading, onEmail, onPassword, onSubmit, onForgot } = props;

  return (
    <form
      className="space-y-4"
      onSubmit={onSubmit}
      aria-label={mode === "signin" ? "Formulário de login" : "Formulário de cadastro"}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("password")}</Label>
          {mode === "signin" && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
              onClick={onForgot}
            >
              Esqueci minha senha
            </button>
          )}
        </div>
        <Input
          id="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          required
          minLength={8}
          aria-describedby={mode === "signup" ? "password-hint" : undefined}
        />
        {mode === "signup" && (
          <div id="password-hint">
            <PasswordStrength password={password} />
          </div>
        )}
      </div>
      <Button
        type="submit"
        className="w-full h-11 text-base font-semibold"
        disabled={loading || (mode === "signup" && !isPasswordAcceptable(password))}
      >
        {loading ? "..." : mode === "signin" ? t("login") : "Criar conta grátis"}
      </Button>
    </form>
  );
}
