import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/followups")({ component: Page });
function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Follow-ups</h1>
      <Card><CardHeader><CardTitle>Pendentes</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Em breve: lista de candidaturas vencidas há 2+ dias com geração automática de mensagem.</p></CardContent></Card>
    </div>
  );
}
