import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import { listSecurityScanRuns, runSecurityLinterNow, type SecurityScanRunRow } from "@/lib/security-scans.functions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, AlertOctagon, AlertTriangle, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";

export const Route = createFileRoute("/_authenticated/admin/security")({
  beforeLoad: async () => {
    try {
      await requireAdminAccess({ data: { route: "admin/security" } });
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminSecurityPage,
});

function AdminSecurityPage() {
  const list = useServerFn(listSecurityScanRuns);
  const runNow = useServerFn(runSecurityLinterNow);
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ["admin", "security-scan-runs"],
    queryFn: () => list({ data: { limit: 30 } }),
  });

  const runMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: async () => {
      toast.success("Scan executado");
      await qc.invalidateQueries({ queryKey: ["admin", "security-scan-runs"] });
    },
    onError: (e) => toastError(e, { title: "Falha ao executar scan" }),
  });

  const runs = runsQuery.data ?? [];
  const latest = runs[0];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Segurança do banco"
        description="Histórico das verificações automáticas (linter SQL) executadas todos os dias às 03:00 UTC."
        actions={
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            size="sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
            Rodar scan agora
          </Button>
        }
      />

      {/* Resumo da última execução */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Total"
          value={latest?.total ?? 0}
          tone="muted"
        />
        <SummaryCard
          icon={<AlertOctagon className="h-4 w-4" />}
          label="Críticos (error)"
          value={latest?.errors ?? 0}
          tone={latest && latest.errors > 0 ? "danger" : "ok"}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Avisos (warn)"
          value={latest?.warnings ?? 0}
          tone={latest && latest.warnings > 0 ? "warning" : "ok"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas execuções</CardTitle>
          <CardDescription>Clique numa linha para ver os findings.</CardDescription>
        </CardHeader>
        <CardContent>
          {runsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução ainda. Rode o scan agora.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead className="text-right">Avisos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <RunRow
                    key={r.id}
                    run={r}
                    expanded={openId === r.id}
                    onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "ok" | "warning" | "danger" | "muted" }) {
  const cls =
    tone === "danger" ? "border-destructive/40 bg-destructive/5"
    : tone === "warning" ? "border-warning/40 bg-warning/5"
    : tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5"
    : "";
  return (
    <Card className={cls}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function RunRow({ run, expanded, onToggle }: { run: SecurityScanRunRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
        <TableCell className="whitespace-nowrap text-sm">{new Date(run.scanned_at).toLocaleString("pt-BR")}</TableCell>
        <TableCell><Badge variant="outline" className="font-mono text-xs">{run.source}</Badge></TableCell>
        <TableCell className="text-right">
          {run.errors > 0 ? <Badge variant="destructive">{run.errors}</Badge> : <span className="text-muted-foreground">0</span>}
        </TableCell>
        <TableCell className="text-right">
          {run.warnings > 0 ? <Badge variant="secondary">{run.warnings}</Badge> : <span className="text-muted-foreground">0</span>}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/30">
            {run.findings.length === 0 ? (
              <p className="text-sm text-emerald-600">Nenhum finding nessa execução. ✓</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {run.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge variant={f.level === "error" ? "destructive" : "secondary"} className="mt-0.5">{f.level}</Badge>
                    <div>
                      <code className="text-xs">{f.check}</code> · <span className="font-mono text-xs text-muted-foreground">{f.object}</span>
                      <div className="text-xs">{f.message}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
