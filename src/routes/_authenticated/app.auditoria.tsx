import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Download, Shield, Lock, KeyRound, Eye } from "lucide-react";
import { toast } from "sonner";
import { getAuditStats, listAuditEvents } from "@/lib/security-admin.functions";
import { SecurityAuditPdf } from "@/components/SecurityAuditPdf";

export const Route = createFileRoute("/_authenticated/app/auditoria")({
  component: AuditPanel,
});

function sevVariant(lvl: string): "default" | "destructive" | "secondary" {
  if (lvl === "high") return "destructive";
  if (lvl === "medium") return "default";
  return "secondary";
}

function AuditPanel() {
  const fetchStats = useServerFn(getAuditStats);
  const fetchEvents = useServerFn(listAuditEvents);
  const [filter, setFilter] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const stats = useQuery({
    queryKey: ["audit-stats"],
    queryFn: () => fetchStats(),
  });
  const events = useQuery({
    queryKey: ["audit-events", filter],
    queryFn: () =>
      fetchEvents({ data: { event_type: filter || undefined, limit: 200, since_days: 30 } }),
  });

  if (stats.error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Acesso negado. Apenas administradores podem ver a auditoria.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleExport = async () => {
    if (!stats.data || !events.data) return;
    setExporting(true);
    try {
      const blob = await pdf(
        <SecurityAuditPdf stats={stats.data} events={events.data} />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório PDF gerado");
    } catch (e) {
      toast.error("Falha ao gerar PDF");
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  const t = stats.data?.totals;
  const alerts = stats.data?.risk_alerts ?? [];
  const highAlerts = alerts.filter((a) => a.risk_level === "high");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="size-6" /> Auditoria de Segurança
          </h1>
          <p className="text-sm text-muted-foreground">
            Últimos 30 dias · Retenção automática: 180 dias
          </p>
        </div>
        <Button onClick={handleExport} disabled={exporting || !stats.data}>
          <Download className="size-4" /> {exporting ? "Gerando…" : "Exportar PDF"}
        </Button>
      </div>

      {highAlerts.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">
                {highAlerts.length} alerta(s) de risco ALTO nas últimas 24h
              </p>
              <p className="text-muted-foreground">
                Possível tentativa de força bruta ou ataque automatizado. Investigue os IPs abaixo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={<Lock className="size-4" />} label="HIBP Blocks" value={t?.hibp ?? 0} />
        <Kpi icon={<KeyRound className="size-4" />} label="Senhas fracas" value={t?.weak ?? 0} />
        <Kpi icon={<AlertTriangle className="size-4" />} label="Falhas auth" value={t?.auth_fail ?? 0} />
        <Kpi icon={<Eye className="size-4" />} label="Acessos PII" value={t?.pii ?? 0} />
      </div>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">Alertas de Risco</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="trend">Tendência</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          <Card>
            <CardHeader><CardTitle className="text-base">IPs com atividade suspeita (24h)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-right">Eventos</TableHead>
                    <TableHead className="text-right">Falhas Auth</TableHead>
                    <TableHead className="text-right">HIBP</TableHead>
                    <TableHead>Severidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum alerta</TableCell></TableRow>
                  )}
                  {alerts.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(a.hour).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="font-mono text-xs">{a.ip_address ?? "—"}</TableCell>
                      <TableCell className="text-right">{a.total_events}</TableCell>
                      <TableCell className="text-right">{a.auth_failures}</TableCell>
                      <TableCell className="text-right">{a.hibp_blocks}</TableCell>
                      <TableCell><Badge variant={sevVariant(a.risk_level)}>{a.risk_level.toUpperCase()}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Eventos recentes</CardTitle>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-sm border rounded px-2 py-1 bg-background"
              >
                <option value="">Todos os tipos</option>
                <option value="hibp_block">HIBP Block</option>
                <option value="weak_password_block">Senha Fraca</option>
                <option value="auth_failure">Falha de Auth</option>
                <option value="pii_access">Acesso PII</option>
                <option value="admin_action">Ação Admin</option>
              </select>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Email (hash)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(events.data ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell><Badge variant="outline">{e.event_type}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{e.ip_address ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.resource ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.email_hash ? e.email_hash.slice(0, 12) + "…" : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {events.data?.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum evento</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend">
          <Card>
            <CardHeader><CardTitle className="text-base">Tendência diária</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead className="text-right">HIBP</TableHead>
                    <TableHead className="text-right">Senhas fracas</TableHead>
                    <TableHead className="text-right">Falhas auth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stats.data?.hibp_daily ?? []).map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(d.day).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{d.hibp_blocks}</TableCell>
                      <TableCell className="text-right">{d.weak_blocks}</TableCell>
                      <TableCell className="text-right">{d.auth_failures}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
