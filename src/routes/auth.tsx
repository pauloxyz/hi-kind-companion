import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { I18nProvider } from "@/lib/i18n";
import logo from "@/assets/vaiprala-logo.png";
import { isPasswordAcceptable } from "@/components/PasswordStrength";
import { logSecurityEvent } from "@/lib/security-audit.functions";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { AuthBrandAside } from "@/components/auth/AuthBrandAside";
import { AuthHeading, type AuthMode } from "@/components/auth/AuthHeading";
import { GoogleAuthButton, EmailSeparator } from "@/components/auth/GoogleAuthButton";
import { AuthEmailForm } from "@/components/auth/AuthEmailForm";
import { AuthResetForm } from "@/components/auth/AuthResetForm";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode === "signup" || search.mode === "forgot" ? search.mode : undefined) as
      | "signup"
      | "forgot"
      | undefined,
  }),
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
 * /auth page. Owns the shared form state (email/password/mode/loading) and
 * delegates presentation to focused components under src/components/auth/.
 * All auth-side effects (Supabase signIn/signUp/reset, OAuth, security
 * event logging) live here so the child components stay dumb & reusable.
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

  // Auto-redirect authenticated users to /app on mount.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success("Enviamos um link de redefinição. Verifique seu e-mail.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar link");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Client-side password quality gate — server also enforces HIBP.
    if (mode === "signup" && !isPasswordAcceptable(password)) {
      toast.error("Senha muito fraca. Use 8+ caracteres misturando letras, números e símbolos.");
      void logSecurityEvent({ data: { event_type: "weak_password_block", email } }).catch(() => {});
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          void logSecurityEvent({ data: { event_type: "auth_failure", email, metadata: { reason: error.message } } }).catch(() => {});
          throw error;
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) {
          // HIBP rejections come back as "weak"/"pwned"/"leaked" — bucket
          // them separately from generic auth failures for audit trails.
          const isHibp = /weak|pwned|leaked|known.*easy.*guess/i.test(error.message);
          void logSecurityEvent({
            data: {
              event_type: isHibp ? "hibp_block" : "auth_failure",
              email,
              metadata: { reason: error.message, status: (error as { status?: number }).status ?? null },
            },
          }).catch(() => {});
          throw error;
        }
      }
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar com Google");
    } finally {
      setGoogleLoading(false);
    }
  };

  const toggleMode = () => {
    setResetSent(false);
    setMode(mode === "signin" ? "signup" : "signin");
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
                onEmail={setEmail}
                onSubmit={sendReset}
              />
            ) : (
              <AuthEmailForm
                mode={mode}
                email={email}
                password={password}
                loading={loading}
                onEmail={setEmail}
                onPassword={setPassword}
                onSubmit={submit}
                onForgot={() => { setResetSent(false); setMode("forgot"); }}
              />
            )}

            <button
              type="button"
              className="w-full text-sm font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
              onClick={toggleMode}
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
