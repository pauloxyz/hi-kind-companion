import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/empregadores")({ component: Page });
function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Empregadores</h1>
      <Card><CardHeader><CardTitle>Notas e histórico</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Em breve: notas livres, histórico de candidaturas e flag de suspeito por empregador.</p></CardContent></Card>
    </div>
  );
}
