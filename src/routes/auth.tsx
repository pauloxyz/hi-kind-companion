import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n, I18nProvider } from "@/lib/i18n";
import logo from "@/assets/vaiprala-logo.png";
import farmBg from "@/assets/auth-farm-bg.jpg";
import { PasswordStrength, isPasswordAcceptable } from "@/components/PasswordStrength";
import { logSecurityEvent } from "@/lib/security-audit.functions";

export const Route = createFileRoute("/auth")({
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C33.9 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.3-.1-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C33.9 6.1 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.1 0 9.8-2 13.3-5.2l-6.1-5c-2 1.4-4.5 2.2-7.2 2.2-5.2 0-9.6-3.6-11.2-8.4l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5c-.4.4 6.7-4.9 6.7-14.5 0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(() => {
    if (typeof window === "undefined") return "signin";
    const m = new URLSearchParams(window.location.search).get("mode");
    return m === "signup" || m === "forgot" ? m : "signin";
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const message = err instanceof Error ? err.message : "Erro";
      toast.error(message);
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

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      {/* Full-bleed faded American farm background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${farmBg})` }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, rgba(10,22,55,0.92) 0%, rgba(10,22,55,0.78) 45%, rgba(10,22,55,0.55) 65%, rgba(255,255,255,0.78) 100%)",
        }}
        aria-hidden
      />
      {/* Subtle flag stripes texture */}
      <div
        className="absolute inset-y-0 right-0 w-1/2 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, #ffffff 0 24px, transparent 24px 48px)" }}
        aria-hidden
      />

      <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
        <aside className="hidden lg:flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img src={logo} alt="VaiPraLá" width={56} height={56} className="h-14 w-14 drop-shadow-lg" />
            <div>
              <div className="text-2xl font-bold tracking-tight">VaiPraLá</div>
              <div className="text-xs uppercase tracking-[0.18em] text-white/80">Brasil → USA · H-2A</div>
            </div>
          </div>

          <div className="space-y-6 max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ffdf00]" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/90">Vagas reais · DOL</span>
            </div>
            <p className="text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight drop-shadow-md">
              Da roça brasileira <br />
              <span className="italic font-light text-[#ffdf00]">para a fazenda</span> <br />
              americana.
            </p>
            <p className="text-lg text-white/90 leading-relaxed max-w-md">
              Encontre vagas H-2A reais do Departamento do Trabalho, gere cartas em inglês,
              grave seu vídeo de apresentação e acompanhe cada passo do visto.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {["Vagas DOL ao vivo", "Carta em inglês com IA", "Vídeo + galeria", "Checklist do visto"].map((tag) => (
                <span key={tag} className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/15 backdrop-blur-sm border border-white/25">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/80 flex items-center gap-2">
            <span className="inline-block h-1.5 w-8 rounded-full bg-[#ffdf00]" />
            <span className="inline-block h-1.5 w-8 rounded-full bg-white" />
            <span className="inline-block h-1.5 w-8 rounded-full bg-[#b22234]" />
            <span className="ml-2">Feito por brasileiros, para brasileiros.</span>
          </div>
        </aside>

        <main className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/40 bg-card/95 p-7 shadow-2xl backdrop-blur-xl">
            <div className="lg:hidden flex flex-col items-center gap-2">
              <img src={logo} alt="VaiPraLá" width={72} height={72} className="h-18 w-18" />
              <div className="text-xl font-bold tracking-tight">VaiPraLá</div>
            </div>


            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight">
                {mode === "signin" && "Bem-vindo de volta"}
                {mode === "signup" && "Comece sua jornada"}
                {mode === "forgot" && "Recuperar senha"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === "signin" && "Entre para acompanhar suas candidaturas."}
                {mode === "signup" && "Crie sua conta gratuita em menos de um minuto."}
                {mode === "forgot" && "Enviaremos um link para você criar uma nova senha."}
              </p>
            </div>

            {mode !== "forgot" && (
              <>
                <Button type="button" variant="outline" className="w-full h-11 gap-2" disabled={googleLoading} onClick={signInGoogle} aria-label="Continuar com Google">
                  <GoogleIcon />
                  {googleLoading ? "Conectando..." : "Continuar com Google"}
                </Button>

                <div className="relative" role="separator" aria-label="ou com e-mail">
                  <div className="absolute inset-0 flex items-center" aria-hidden><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wider">
                    <span className="bg-card px-2 text-muted-foreground">ou com e-mail</span>
                  </div>
                </div>
              </>
            )}

            {mode === "forgot" ? (
              resetSent ? (
                <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-foreground" role="status" aria-live="polite">
                  Link enviado para <strong>{email}</strong>. Confira sua caixa de entrada e o spam.
                </div>
              ) : (
                <form className="space-y-4" onSubmit={sendReset} aria-label="Formulário de recuperação de senha">
                  <div className="space-y-1.5">
                    <Label htmlFor="email-reset">{t("email")}</Label>
                    <Input id="email-reset" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
                    {loading ? "Enviando…" : "Enviar link de recuperação"}
                  </Button>
                </form>
              )
            ) : (
              <form className="space-y-4" onSubmit={submit} aria-label={mode === "signin" ? "Formulário de login" : "Formulário de cadastro"}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("password")}</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                        onClick={() => { setResetSent(false); setMode("forgot"); }}
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
                    onChange={(e) => setPassword(e.target.value)}
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
            )}

            <button
              type="button"
              className="w-full text-sm font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
              onClick={() => {
                setResetSent(false);
                setMode(mode === "signin" ? "signup" : mode === "signup" ? "signin" : "signin");
              }}
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
