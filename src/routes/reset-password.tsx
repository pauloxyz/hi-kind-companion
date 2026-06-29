import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ThemeProvider } from "@/lib/theme";
import logo from "@/assets/vaiprala-logo.png";
import farmBg from "@/assets/auth-farm-bg.jpg";
import { PasswordStrength, isPasswordAcceptable } from "@/components/PasswordStrength";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — VaiPraLá" },
      { name: "description", content: "Crie uma nova senha segura para sua conta VaiPraLá e volte a acessar suas candidaturas H-2A em segundos." },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "Redefinir senha — VaiPraLá" },
      { property: "og:description", content: "Defina uma nova senha para sua conta VaiPraLá." },
      { property: "og:url", content: "/reset-password" },
    ],
  }),
  component: () => (
    <ThemeProvider>
      <ResetPasswordPage />
    </ThemeProvider>
  ),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    // Supabase password-recovery flow puts type=recovery in URL hash and emits a session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasSession(true);
      }
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordAcceptable(password)) {
      return toast.error("Senha muito fraca. Use 8+ caracteres misturando letras, números e símbolos.");
    }
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada! Entrando…");
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${farmBg})` }} aria-hidden />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(115deg, rgba(10,22,55,0.92) 0%, rgba(10,22,55,0.78) 45%, rgba(10,22,55,0.55) 65%, rgba(255,255,255,0.78) 100%)" }}
        aria-hidden
      />
      <main className="relative flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/40 bg-card/95 p-7 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center gap-2">
            <img src={logo} alt="" width={56} height={56} className="h-14 w-14" />
            <h1 className="text-2xl font-bold tracking-tight">Redefinir senha</h1>
            <p className="text-sm text-muted-foreground text-center">
              Escolha uma nova senha forte para sua conta.
            </p>
          </div>

          {!ready ? (
            <p className="text-sm text-center text-muted-foreground">Verificando link…</p>
          ) : !hasSession ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-foreground">
                O link expirou ou é inválido. Solicite um novo na tela de login.
              </p>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Ir para o login
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit} aria-label="Formulário de nova senha">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  aria-describedby="new-password-hint"
                />
                <div id="new-password-hint">
                  <PasswordStrength password={password} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold"
                disabled={loading || !isPasswordAcceptable(password) || password !== confirm}
              >
                {loading ? "Salvando…" : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
