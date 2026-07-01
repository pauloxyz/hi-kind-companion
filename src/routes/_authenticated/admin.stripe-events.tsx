import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import {
  listStripeWebhookEvents,
  listStripeWebhookEventTypes,
  type StripeWebhookEventRow,
} from "@/lib/stripe-webhook-events.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

type EnvFilter = "all" | "sandbox" | "live";
type StatusFilter = "all" | "processed" | "ignored" | "error";

export const Route = createFileRoute("/_authenticated/admin/stripe-events")({
  beforeLoad: async () => {
    try {
      await requireAdminAccess({ data: { route: "admin/stripe-events" } });
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminStripeEventsPage,
});

function AdminStripeEventsPage() {
  const list = useServerFn(listStripeWebhookEvents);
  const listTypes = useServerFn(listStripeWebhookEventTypes);

  const [environment, setEnvironment] = useState<EnvFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: ["admin", "stripe-events", "types"],
    queryFn: () => listTypes(),
  });

  const eventsQuery = useQuery({
    queryKey: ["admin", "stripe-events", environment, status, eventType],
    queryFn: () =>
      list({
        data: {
          environment,
          status,
          eventType: eventType === "all" ? undefined : eventType,
          limit: 100,
        },
      }),
  });

  const rows = eventsQuery.data ?? [];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Eventos do Stripe"
        description="Auditoria dos webhooks recebidos em /api/public/payments/webhook, com filtros por ambiente, tipo e status."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => eventsQuery.refetch()}
            disabled={eventsQuery.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${eventsQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Últimos 100 eventos que casam com os filtros.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <FilterSelect
              label="Ambiente"
              value={environment}
              onChange={(v) => setEnvironment(v as EnvFilter)}
              options={[
                { value: "all", label: "Todos" },
                { value: "sandbox", label: "Sandbox" },
                { value: "live", label: "Live" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={[
                { value: "all", label: "Todos" },
                { value: "processed", label: "Processado" },
                { value: "ignored", label: "Ignorado" },
                { value: "error", label: "Erro" },
              ]}
            />
            <FilterSelect
              label="Tipo de evento"
              value={eventType}
              onChange={setEventType}
              options={[
                { value: "all", label: "Todos" },
                ...(typesQuery.data ?? []).map((t) => ({ value: t, label: t })),
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recentes</CardTitle>
          <CardDescription>Clique numa linha para inspecionar o payload resumido.</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : eventsQuery.isError ? (
            <p className="text-sm text-destructive">Falha ao carregar eventos.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento encontrado com os filtros atuais.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Recebido em</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ambiente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="font-mono text-xs">stripe_event_id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <EventRow
                    key={r.id}
                    row={r}
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

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "processed") return "default";
  if (status === "error") return "destructive";
  if (status === "ignored") return "secondary";
  return "outline";
}

function EventRow({
  row, expanded, onToggle,
}: { row: StripeWebhookEventRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {new Date(row.received_at).toLocaleString("pt-BR")}
        </TableCell>
        <TableCell className="font-mono text-xs">{row.event_type}</TableCell>
        <TableCell>
          <Badge variant={row.environment === "live" ? "default" : "outline"}>
            {row.environment}
          </Badge>
        </TableCell>
        <TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{row.stripe_event_id}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            {row.error_message && (
              <p className="mb-2 text-sm text-destructive">
                <span className="font-medium">Erro:</span> {row.error_message}
              </p>
            )}
            <pre className="max-h-80 overflow-auto rounded bg-background p-3 text-xs">
              {JSON.stringify(row.payload_summary ?? {}, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
