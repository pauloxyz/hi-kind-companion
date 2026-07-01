import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  head: () => ({
    meta: [
      { title: "Cancelar inscrição — V+ USA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function UnsubscribePage() {
  const [state, setState] = useState<"loading" | "ready" | "done" | "invalid" | "already" | "error">("loading");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) {
      setState("invalid");
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState("ready");
        else if (d.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, []);

  async function confirm() {
    if (!token) return;
    setState("loading");
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await res.json();
      if (d.success) setState("done");
      else if (d.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  // Título dinâmico por estado — mantido como um único <h1> na página
  // (disciplina de cabeçalho enforçada por seo-structured-data.test.ts).
  // Os subtítulos por estado usam <h2> porque descrevem uma seção do fluxo,
  // não o assunto da página.
  const heading =
    state === "done"    ? "Inscrição cancelada" :
    state === "already" ? "Você já cancelou" :
    state === "invalid" ? "Link inválido" :
    state === "error"   ? "Algo deu errado" :
    "Cancelar inscrição";

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 space-y-4 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">V+ USA</div>
          <h1 className="text-xl font-bold" aria-live="polite">{heading}</h1>

          {state === "loading" && (
            <>
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">Validando seu link…</p>
            </>
          )}
          {state === "ready" && (
            <>
              <p className="text-sm text-muted-foreground">
                Você não receberá mais e-mails do V+ USA neste endereço. Você pode
                voltar a se inscrever a qualquer momento atualizando suas
                preferências na sua conta.
              </p>
              <Button onClick={confirm} className="w-full">
                Confirmar cancelamento
              </Button>
            </>
          )}
          {state === "done" && (
            <>
              <CheckCircle2 className="h-10 w-10 mx-auto text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Pronto. Não enviaremos mais e-mails para este endereço.
              </p>
            </>
          )}
          {state === "already" && (
            <>
              <CheckCircle2 className="h-10 w-10 mx-auto text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Este endereço já está fora da nossa lista de envio.
              </p>
            </>
          )}
          {state === "invalid" && (
            <>
              <XCircle className="h-10 w-10 mx-auto text-destructive" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Este link expirou ou não é válido. Você pode pedir um novo a partir
                de qualquer e-mail recente.
              </p>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="h-10 w-10 mx-auto text-destructive" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Tente novamente em alguns instantes.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
