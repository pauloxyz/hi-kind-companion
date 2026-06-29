import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { PdfLogo, PdfBrandedFooter } from "./PdfLogo";
import type { AuditEvent, AuditStats } from "@/lib/security-admin.functions";

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9, color: "#111" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  meta: { fontSize: 9, color: "#555", marginBottom: 12 },
  section: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6, textTransform: "uppercase" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 3 },
  th: { fontFamily: "Helvetica-Bold", backgroundColor: "#f1f1f1" },
  c1: { width: "18%" },
  c2: { width: "18%" },
  c3: { width: "16%" },
  c4: { width: "18%" },
  c5: { width: "30%" },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  kpi: { flex: 1, borderWidth: 0.5, borderColor: "#ccc", padding: 8, borderRadius: 3 },
  kpiLabel: { fontSize: 8, color: "#666", textTransform: "uppercase" },
  kpiValue: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 2 },
  badge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, fontSize: 8 },
});

const sevColor = (lvl: string) =>
  lvl === "high" ? "#dc2626" : lvl === "medium" ? "#d97706" : "#16a34a";

export type SecurityAuditPdfFilters = {
  event_type?: string | null;
  since_days?: number | null;
  route?: string | null;
  user_id?: string | null;
  search?: string | null;
};

export function SecurityAuditPdf({
  stats,
  events,
  filters,
}: {
  stats: AuditStats;
  events: AuditEvent[];
  filters?: SecurityAuditPdfFilters;
}) {
  const f = filters ?? {};
  const activeFilters: string[] = [];
  if (f.event_type) activeFilters.push(`tipo=${f.event_type}`);
  if (f.route) activeFilters.push(`rota~${f.route}`);
  if (f.user_id) activeFilters.push(`user~${f.user_id}`);
  if (f.search) activeFilters.push(`busca~${f.search}`);
  const window = `${f.since_days ?? 30} dia(s)`;
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>Relatório de Auditoria de Segurança</Text>
        <Text style={s.meta}>
          Gerado em {new Date().toLocaleString("pt-BR")} · Janela: {window}
          {activeFilters.length > 0 ? ` · Filtros: ${activeFilters.join(" · ")}` : " · Filtros: nenhum"}
        </Text>



        <View style={s.kpiRow}>
          <View style={s.kpi}><Text style={s.kpiLabel}>HIBP Blocks</Text><Text style={s.kpiValue}>{stats.totals.hibp}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Senhas Fracas</Text><Text style={s.kpiValue}>{stats.totals.weak}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Falhas Auth</Text><Text style={s.kpiValue}>{stats.totals.auth_fail}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Acessos PII</Text><Text style={s.kpiValue}>{stats.totals.pii}</Text></View>
        </View>

        <Text style={s.section}>Alertas de Risco (24h)</Text>
        <View style={[s.row, s.th]}>
          <Text style={s.c1}>Hora</Text>
          <Text style={s.c2}>IP</Text>
          <Text style={s.c3}>Eventos</Text>
          <Text style={s.c4}>Falhas</Text>
          <Text style={s.c5}>Severidade</Text>
        </View>
        {stats.risk_alerts.slice(0, 20).map((a, i) => (
          <View key={i} style={s.row}>
            <Text style={s.c1}>{new Date(a.hour).toLocaleString("pt-BR")}</Text>
            <Text style={s.c2}>{a.ip_address ?? "—"}</Text>
            <Text style={s.c3}>{a.total_events}</Text>
            <Text style={s.c4}>{a.auth_failures}</Text>
            <Text style={[s.c5, { color: sevColor(a.risk_level) }]}>{a.risk_level.toUpperCase()}</Text>
          </View>
        ))}
        {stats.risk_alerts.length === 0 && <Text style={s.meta}>Nenhum alerta nas últimas 24h.</Text>}

        <Text style={s.section}>Tendência Diária (HIBP/Fracas/Auth)</Text>
        <View style={[s.row, s.th]}>
          <Text style={s.c1}>Dia</Text>
          <Text style={s.c2}>HIBP</Text>
          <Text style={s.c3}>Fracas</Text>
          <Text style={s.c4}>Falhas Auth</Text>
          <Text style={s.c5}></Text>
        </View>
        {stats.hibp_daily.map((d, i) => (
          <View key={i} style={s.row}>
            <Text style={s.c1}>{new Date(d.day).toLocaleDateString("pt-BR")}</Text>
            <Text style={s.c2}>{d.hibp_blocks}</Text>
            <Text style={s.c3}>{d.weak_blocks}</Text>
            <Text style={s.c4}>{d.auth_failures}</Text>
            <Text style={s.c5}></Text>
          </View>
        ))}
      </Page>

      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>Eventos Filtrados</Text>
        <Text style={s.meta}>
          {events.length} evento(s) após aplicação dos filtros
          {activeFilters.length > 0 ? ` (${activeFilters.join(" · ")})` : ""}
        </Text>

        <View style={[s.row, s.th]}>
          <Text style={s.c1}>Data</Text>
          <Text style={s.c2}>Tipo</Text>
          <Text style={s.c3}>IP</Text>
          <Text style={s.c4}>Recurso</Text>
          <Text style={s.c5}>Email Hash</Text>
        </View>
        {events.map((e) => (
          <View key={e.id} style={s.row}>
            <Text style={s.c1}>{new Date(e.created_at).toLocaleString("pt-BR")}</Text>
            <Text style={s.c2}>{e.event_type}</Text>
            <Text style={s.c3}>{e.ip_address ?? "—"}</Text>
            <Text style={s.c4}>{e.resource ?? "—"}</Text>
            <Text style={s.c5}>{e.email_hash ? e.email_hash.slice(0, 16) + "…" : "—"}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
