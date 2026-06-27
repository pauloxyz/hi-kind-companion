import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/midia")({ component: Page });
function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mídia de Trabalho</h1>
      <Card><CardHeader><CardTitle>Galeria</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Em breve: upload de fotos e vídeos por categoria e marcação de destaque.</p></CardContent></Card>
    </div>
  );
}
