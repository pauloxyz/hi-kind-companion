import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n, I18nProvider } from "@/lib/i18n";
import logo from "@/assets/vaiprala-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "VaiPraLá — Da roça brasileira para a fazenda americana" },
      { name: "description", content: "Plataforma que conecta trabalhadores rurais brasileiros a vagas H-2A nos Estados Unidos." },
    ],
  }),
  component: () => (
    <I18nProvider>
      <AuthPage />
    </I18nProvider>
  ),
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) throw error;
      }
      navigate({ to: "/app", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* LEFT — editorial hero with brand story */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden text-white">
        {/* Layered backdrop: Brazilian green → American blue diagonal */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, #00923f 0%, #009c3b 28%, #ffdf00 42%, #ffffff 50%, #b22234 58%, #3c3b6e 100%)",
          }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-black/35" aria-hidden />
        {/* Subtle stripes overlay (US flag whisper) */}
        <div
          className="absolute inset-y-0 right-0 w-1/2 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, #ffffff 0 22px, transparent 22px 44px)",
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <img src={logo} alt="VaiPraLá" width={56} height={56} className="h-14 w-14 drop-shadow-lg" />
          <div>
            <div className="text-2xl font-bold tracking-tight">VaiPraLá</div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/80">Brasil → USA · H-2A</div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-lg">
          <h1 className="text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight">
            Da roça brasileira <br />
            <span className="italic font-light">para a fazenda</span> <br />
            americana.
          </h1>
          <p className="text-lg text-white/85 leading-relaxed">
            Encontre vagas H-2A reais do Departamento do Trabalho, gere cartas em inglês,
            grave seu vídeo de apresentação e acompanhe cada passo do visto.
            Tudo em um só lugar, no seu idioma.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {["Vagas DOL ao vivo", "Carta em inglês com IA", "Vídeo + galeria", "Checklist do visto"].map((tag) => (
              <span key={tag} className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/15 backdrop-blur-sm border border-white/20">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-white/70 flex items-center gap-2">
          <span className="inline-block h-1.5 w-8 rounded-full bg-[#ffdf00]" />
          <span className="inline-block h-1.5 w-8 rounded-full bg-white" />
          <span className="inline-block h-1.5 w-8 rounded-full bg-[#b22234]" />
          <span className="ml-2">Feito por brasileiros, para brasileiros.</span>
        </div>
      </aside>

      {/* RIGHT — sign-in card */}
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center gap-2">
            <img src={logo} alt="VaiPraLá" width={72} height={72} className="h-18 w-18" />
            <div className="text-xl font-bold tracking-tight">VaiPraLá</div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-3xl font-bold tracking-tight">
              {mode === "signin" ? "Bem-vindo de volta" : "Comece sua jornada"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "signin"
                ? "Entre para acompanhar suas candidaturas e vagas."
                : "Crie sua conta gratuita em menos de um minuto."}
            </p>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              {mode === "signup" && <p className="text-[11px] text-muted-foreground">Mínimo 8 caracteres.</p>}
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
              {loading ? "..." : mode === "signin" ? t("login") : "Criar conta grátis"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-background px-2 text-muted-foreground">
                {mode === "signin" ? "Primeira vez aqui?" : "Já tem conta?"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="w-full text-sm font-medium text-primary hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Criar conta gratuita →" : "← Voltar ao login"}
          </button>

          <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
            Ao continuar você concorda em receber atualizações sobre vagas H-2A.
            <br />Não compartilhamos seus dados.
          </p>
        </div>
      </main>
    </div>
  );
}
