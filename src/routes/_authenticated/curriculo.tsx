import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/curriculo")({ component: Page });
function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Currículo</h1>
      <Card><CardHeader><CardTitle>Construtor</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Em breve: wizard para resumo, experiências, skills e geração de PDF em estilo americano de trabalho manual.
          </p>
        </CardContent></Card>
    </div>
  );
}
