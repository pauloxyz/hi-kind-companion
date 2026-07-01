import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { I18nProvider } from "@/lib/i18n";
import logo from "@/assets/vaiprala-logo.png";
import { isPasswordAcceptable } from "@/components/PasswordStrength";
import { logSecurityEvent } from "@/lib/security-audit.functions";
import { toastError, toastSuccess } from "@/lib/toast-error";
import { toAuthUiError, type AuthUiError } from "@/lib/auth-errors";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { AuthBrandAside } from "@/components/auth/AuthBrandAside";
import { AuthHeading, type AuthMode } from "@/components/auth/AuthHeading";
import { GoogleAuthButton, EmailSeparator } from "@/components/auth/GoogleAuthButton";
import { AuthEmailForm } from "@/components/auth/AuthEmailForm";
import { AuthResetForm } from "@/components/auth/AuthResetForm";

export const Route = createFileRoute("/auth")({
  // Só retorna `mode` quando ele veio como signup/forgot; caso contrário,
  // devolve `{}` para que TanStack Router marque o search inteiro como
  // opcional — assim <Link to="/auth"> e navigate({to:"/auth"}) não precisam
  // passar `search` em cada call site.
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" | "forgot" } => {
    if (search.mode === "signup" || search.mode === "forgot") return { mode: search.mode };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta — VaiPraLá" },
      { name: "description", content: "Acesse seu painel VaiPraLá para se candidatar a vagas H-2A, gerar cartas em inglês com IA e acompanhar suas inscrições nos EUA." },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "Entrar ou criar conta — VaiPraLá" },
      { property: "og:description", content: "Acesse seu painel de candidaturas H-2A no VaiPraLá." },
      { property: "og:url", content: "/auth" },
    ],
  }),
  component: () => (
    <I18nProvider>
      <AuthPage />
    </I18nProvider>
  ),
});

/**
 * /auth page. Owns the shared form state and delegates presentation to
 * focused components under src/components/auth/.
 *
 * Feedback contract (same across signin / signup / reset):
 *   - Loading   → AuthSubmitButton shows spinner + aria-busy; inputs disable.
 *   - Errors    → converted via toAuthUiError() → shown inline in the
 *                 AuthErrorAlert (aria-live=assertive) AND as a toast via
 *                 toastError(). Audit-logged with the same "bucket" tag.
 *   - Success   → toastSuccess() for reset; direct navigate() for auth.
 * Errors reset on every submit and on mode toggle so stale banners never
 * outlive the interaction that produced them.
 */
function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>(
    search.mode === "signup" || search.mode === "forgot" ? search.mode : "signin",
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<AuthUiError | null>(null);

  // Auto-redirect authenticated users to /app on mount.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  /**
   * Canonical error handler: normalize → inline banner → toast → audit.
   * Ensures all three surfaces stay in sync no matter which flow failed.
   */
  const handleFailure = (err: unknown, event: "signin_failure" | "signup_failure" | "reset_failure" | "oauth_failure") => {
    const ui = toAuthUiError(err);
    setError(ui);
    toastError(err, { title: ui.title, description: ui.description });
    const raw = err instanceof Error ? err.message : String(err);
    void logSecurityEvent({
      data: {
        event_type: ui.bucket === "hibp" ? "hibp_block" : "auth_failure",
        email,
        metadata: { flow: event, bucket: ui.bucket, reason: raw.slice(0, 240) },
      },
    }).catch(() => {});
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setResetSent(true);
      toastSuccess("Link enviado", "Verifique seu e-mail para redefinir a senha.");
    } catch (err) {
      handleFailure(err, "reset_failure");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Client-side password quality gate — server also enforces HIBP.
    if (mode === "signup" && !isPasswordAcceptable(password)) {
      const ui = toAuthUiError(new Error("weak_password"));
      setError(ui);
      toastError(new Error("weak_password"), { title: ui.title, description: ui.description });
      void logSecurityEvent({ data: { event_type: "weak_password_block", email } }).catch(() => {});
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (err) throw err;
      }
      navigate({ to: "/app", replace: true });
    } catch (err) {
      handleFailure(err, mode === "signin" ? "signin_failure" : "signup_failure");
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      handleFailure(err, "oauth_failure");
    } finally {
      setGoogleLoading(false);
    }
  };

  const toggleMode = () => {
    setResetSent(false);
    setError(null);
    setMode(mode === "signin" ? "signup" : "signin");
  };

  const goToForgot = () => {
    setResetSent(false);
    setError(null);
    setMode("forgot");
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <AuthBackground />

      <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
        <AuthBrandAside />

        <main className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/40 bg-card/95 p-7 shadow-2xl backdrop-blur-xl">
            <div className="lg:hidden flex flex-col items-center gap-2">
              <img src={logo} alt="VaiPraLá" width={72} height={72} className="h-18 w-18" />
              <div className="text-xl font-bold tracking-tight">VaiPraLá</div>
            </div>

            <AuthHeading mode={mode} />

            {mode !== "forgot" && (
              <>
                <GoogleAuthButton loading={googleLoading} onClick={signInGoogle} />
                <EmailSeparator />
              </>
            )}

            {mode === "forgot" ? (
              <AuthResetForm
                email={email}
                loading={loading}
                sent={resetSent}
                error={error}
                onEmail={setEmail}
                onSubmit={sendReset}
              />
            ) : (
              <AuthEmailForm
                mode={mode}
                email={email}
                password={password}
                loading={loading}
                error={error}
                onEmail={setEmail}
                onPassword={setPassword}
                onSubmit={submit}
                onForgot={goToForgot}
              />
            )}

            <button
              type="button"
              className="w-full text-sm font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
              onClick={toggleMode}
              disabled={loading || googleLoading}
            >
              {mode === "signin" && "Criar conta gratuita →"}
              {mode === "signup" && "← Voltar ao login"}
              {mode === "forgot" && "← Voltar ao login"}
            </button>

            <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
              Ao continuar você concorda em receber atualizações sobre vagas H-2A.
              <br />Não compartilhamos seus dados.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
