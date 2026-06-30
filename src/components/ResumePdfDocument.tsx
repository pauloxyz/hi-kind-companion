/**
 * Currículo ATS-friendly: PDF de uma coluna, texto puro em preto sobre
 * branco, sem fotos, sem avatar, sem sidebar colorida. Recrutadores leem
 * em segundos; sistemas automáticos de triagem (ATS) extraem texto sem
 * tropeçar em imagens ou layouts complexos.
 *
 * As fotos e o vídeo ficam na página pública de apresentação (/v/:slug),
 * não aqui. Mantemos o tipo `resumePhotos` por compatibilidade com chamadas
 * existentes, mas ele é ignorado intencionalmente.
 */
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 56, // ~0.75in — margens generosas que ATS espera
    paddingVertical: 48,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#000",
    lineHeight: 1.4,
  },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  headline: { fontSize: 11, color: "#222", marginBottom: 6 },
  contactLine: { fontSize: 10, color: "#222", marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 0.7,
    borderBottomColor: "#000",
    paddingBottom: 2,
  },
  paragraph: { fontSize: 10.5, marginBottom: 4 },
  expRow: { marginBottom: 9 },
  expHeader: { flexDirection: "row", justifyContent: "space-between" },
  expTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  expDates: { fontSize: 10, color: "#333" },
  expMeta: { fontSize: 10, color: "#333", marginBottom: 2 },
  expDesc: { fontSize: 10.5 },
  bulletLine: { fontSize: 10.5, marginBottom: 2 },
});

export type ResumePdfData = {
  fullName: string;
  headline?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  availability?: string;
  summaryEn: string;
  experiences: Array<{
    title: string;
    employer: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    descriptionEn?: string;
  }>;
  skills: string[];
  education?: string;
  languages?: string[];
  /** @deprecated Avatar fica na página pública /v/:slug, não no PDF. */
  avatarUrl?: string;
  /** @deprecated Fotos ficam na página pública /v/:slug, não no PDF. */
  resumePhotos?: Array<{ url: string; caption?: string | null }>;
};

export function ResumePdfDocument({ data }: { data: ResumePdfData }) {
  const contactBits = [
    data.email,
    data.phone,
    [data.city, data.country].filter(Boolean).join(", ") || undefined,
  ].filter(Boolean) as string[];

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Text style={s.name}>{data.fullName || "—"}</Text>
        {data.headline && <Text style={s.headline}>{data.headline}</Text>}
        {contactBits.length > 0 && (
          <Text style={s.contactLine}>{contactBits.join("  •  ")}</Text>
        )}

        {data.summaryEn && (
          <>
            <Text style={s.sectionTitle}>Summary</Text>
            <Text style={s.paragraph}>{data.summaryEn}</Text>
          </>
        )}

        {data.experiences.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Professional Experience</Text>
            {data.experiences.map((e, i) => {
              const dates = [e.startDate, e.endDate].filter(Boolean).join(" – ");
              return (
                <View key={i} style={s.expRow} wrap={false}>
                  <View style={s.expHeader}>
                    <Text style={s.expTitle}>
                      {e.title}
                      {e.employer ? ` — ${e.employer}` : ""}
                    </Text>
                    {dates && <Text style={s.expDates}>{dates}</Text>}
                  </View>
                  {e.location && <Text style={s.expMeta}>{e.location}</Text>}
                  {e.descriptionEn && <Text style={s.expDesc}>{e.descriptionEn}</Text>}
                </View>
              );
            })}
          </>
        )}

        {data.skills.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Skills</Text>
            <Text style={s.paragraph}>{data.skills.join(" • ")}</Text>
          </>
        )}

        {data.languages && data.languages.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Languages</Text>
            <Text style={s.paragraph}>{data.languages.join(" • ")}</Text>
          </>
        )}

        {data.education && (
          <>
            <Text style={s.sectionTitle}>Education</Text>
            <Text style={s.paragraph}>{data.education}</Text>
          </>
        )}

        {data.availability && (
          <>
            <Text style={s.sectionTitle}>Availability</Text>
            <Text style={s.paragraph}>{data.availability}</Text>
          </>
        )}
      </Page>
    </Document>
  );
}
