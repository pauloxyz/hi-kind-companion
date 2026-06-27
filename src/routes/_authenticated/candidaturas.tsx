import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/candidaturas")({ component: Page });
function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Candidaturas</h1>
      <Card><CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Em breve: lista de candidaturas com status e atualizações.</p></CardContent></Card>
    </div>
  );
}
