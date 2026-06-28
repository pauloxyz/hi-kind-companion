import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id: sessionId } = Route.useSearch();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 bg-card border rounded-2xl p-8">
        <CheckCircle2 className="h-14 w-14 text-[#009c3b] mx-auto" />
        <h1 className="text-2xl font-bold">
          {sessionId ? "Pagamento concluído!" : "Sessão não encontrada"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {sessionId
            ? "Obrigado! Sua assinatura Pro foi ativada. Pode levar alguns segundos para aparecer no app."
            : "Não encontramos informações dessa sessão de pagamento."}
        </p>
        <Link to="/">
          <Button className="w-full">Voltar ao app</Button>
        </Link>
      </div>
    </div>
  );
}
