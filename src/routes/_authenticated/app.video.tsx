import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/app/video")({ component: Page });
function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vídeo de Apresentação</h1>
      <Card><CardHeader><CardTitle>Gravação</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Em breve: gravação via webcam e upload, em inglês.</p></CardContent></Card>
    </div>
  );
}
