import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmployers, updateEmployer } from "@/lib/employers.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/empregadores")({ component: Page });

type Employer = Awaited<ReturnType<typeof listEmployers>>[number];
type EmployerPatch = { notes?: string; is_flagged_suspicious?: boolean; flagged_reason?: string };

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listEmployers);
  const update = useServerFn(updateEmployer);
  const { data: emps = [], isPending } = useQuery({ queryKey: ["employers"], queryFn: () => list() });

  async function save(id: string, patch: EmployerPatch) {
    await update({ data: { id, ...patch } });
    qc.invalidateQueries({ queryKey: ["employers"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Empregadores</h1>
      <p className="text-sm text-muted-foreground">Empregadores são criados automaticamente quando você se candidata. Use esta tela para anotar histórico e marcar suspeitos.</p>

      {isPending && (
        <div className="grid gap-3" aria-busy="true" aria-label="Carregando empregadores">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isPending && emps.length === 0 && (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Nenhum empregador ainda — candidate-se a uma vaga para começar.</CardContent></Card>
      )}

      <div className="grid gap-3">
        {emps.map((e: Employer) => (
          <Card key={e.id} className={e.is_flagged_suspicious ? "border-destructive" : ""}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{e.employer_name}</span>
                <div className="flex gap-1 items-center">
                  {e.is_flagged_suspicious && <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Suspeito</Badge>}
                  <Badge variant="secondary">{e._apps} candidatura(s)</Badge>
                  {e._responded > 0 && <Badge className="bg-success">{e._responded} respondeu</Badge>}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                defaultValue={e.notes ?? ""}
                placeholder="Notas pessoais (entrevista, ligação, etc.)"
                onBlur={(ev) => { if (ev.target.value !== (e.notes ?? "")) save(e.id, { notes: ev.target.value }); }}
              />
              <div className="flex items-center justify-between rounded-md border p-2">
                <label className="text-sm">Marcar como suspeito</label>
                <Switch checked={!!e.is_flagged_suspicious} onCheckedChange={(v) => save(e.id, { is_flagged_suspicious: v })} />
              </div>
              {e.is_flagged_suspicious && (
                <Input defaultValue={e.flagged_reason ?? ""} placeholder="Motivo da suspeita"
                  onBlur={(ev) => { if (ev.target.value !== (e.flagged_reason ?? "")) save(e.id, { flagged_reason: ev.target.value }); }} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
