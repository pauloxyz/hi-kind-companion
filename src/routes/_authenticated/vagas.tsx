import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/vagas")({ component: Page });
function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vagas (H-2A)</h1>
      <Card><CardHeader><CardTitle>Banco de Vagas Oficial</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">
          Em breve: importação do feed do DOL (backfill de 15 dias + cron diário), filtros, priorização por data e candidatura individual/em massa.
        </p></CardContent></Card>
    </div>
  );
}
