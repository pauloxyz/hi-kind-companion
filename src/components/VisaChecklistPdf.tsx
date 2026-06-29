import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { PdfLogo, PdfBrandedFooter } from "./PdfLogo";

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 10, color: "#111" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 9, color: "#555", marginBottom: 10 },
  progressBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 8,
    borderWidth: 1,
    borderColor: "#222",
    borderRadius: 4,
    marginBottom: 14,
  },
  progressLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  phaseTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    paddingBottom: 2,
  },
  row: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#ddd",
  },
  rowTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  rowMeta: { fontSize: 9, color: "#444", marginTop: 1 },
  rowAttach: { fontSize: 9, color: "#333", marginTop: 2, marginLeft: 8 },
  status: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, fontSize: 8, color: "#666", textAlign: "center" },
});

export type VisaPdfPhase = {
  title: string;
  items: Array<{
    stepLabel: string;
    isCompleted: boolean;
    eventLabel?: string | null;
    eventAt?: string | null;
    dueLabel?: string | null;
    dueAt?: string | null;
    attachments: string[];
  }>;
};

export type VisaPdfData = {
  fullName?: string | null;
  generatedAt: string;
  done: number;
  total: number;
  phases: VisaPdfPhase[];
};

function fmt(date?: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

export function VisaChecklistPdf({ data }: { data: VisaPdfData }) {
  const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <PdfLogo />
          <Text style={s.sub}>vaiprala.net</Text>
        </View>
        <Text style={s.h1}>Checklist do visto H-2A</Text>
        <Text style={s.sub}>
          {data.fullName ? `${data.fullName} · ` : ""}gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
        </Text>

        <View style={s.progressBox}>
          <Text style={s.progressLabel}>Progresso</Text>
          <Text style={s.progressLabel}>
            {data.done}/{data.total} etapas ({pct}%)
          </Text>
        </View>

        {data.phases.map((phase, i) => (
          <View key={i} wrap={false}>
            <Text style={s.phaseTitle}>{phase.title}</Text>
            {phase.items.map((it, j) => (
              <View key={j} style={s.row} wrap={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.rowTitle}>
                    {it.isCompleted ? "[x] " : "[ ] "}
                    {it.stepLabel}
                  </Text>
                  <Text style={s.status}>{it.isCompleted ? "Concluída" : "Pendente"}</Text>
                </View>
                {it.eventLabel && (
                  <Text style={s.rowMeta}>
                    {it.eventLabel}: {fmt(it.eventAt)}
                  </Text>
                )}
                {it.dueLabel && (
                  <Text style={s.rowMeta}>
                    {it.dueLabel}: {fmt(it.dueAt)}
                  </Text>
                )}
                {it.attachments.length > 0 && (
                  <>
                    <Text style={s.rowMeta}>Anexos:</Text>
                    {it.attachments.map((name, k) => (
                      <Text key={k} style={s.rowAttach}>
                        • {name}
                      </Text>
                    ))}
                  </>
                )}
              </View>
            ))}
          </View>
        ))}

        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
        <PdfBrandedFooter />
      </Page>
    </Document>
  );
}
