import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#111" },
  name: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  contact: { fontSize: 9, color: "#444", marginBottom: 12 },
  hr: { borderBottomWidth: 1, borderBottomColor: "#222", marginVertical: 6 },
  section: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4, textTransform: "uppercase" },
  summary: { fontSize: 10, lineHeight: 1.4, marginBottom: 4 },
  expRow: { marginBottom: 8 },
  expTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  expMeta: { fontSize: 9, color: "#555", marginBottom: 2 },
  expDesc: { fontSize: 10, lineHeight: 1.4 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  skill: {
    fontSize: 9,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#222",
    borderRadius: 2,
    marginRight: 4,
    marginBottom: 4,
  },
});

export type ResumePdfData = {
  fullName: string;
  email?: string;
  phone?: string;
  country?: string;
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
};

export function ResumePdfDocument({ data }: { data: ResumePdfData }) {
  const contactParts = [data.email, data.phone, data.country].filter(Boolean);
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Text style={s.name}>{data.fullName || "—"}</Text>
        <Text style={s.contact}>{contactParts.join("  ·  ")}</Text>
        {data.availability && (
          <Text style={s.contact}>Availability: {data.availability}</Text>
        )}
        <View style={s.hr} />

        {data.summaryEn && (
          <>
            <Text style={s.section}>Summary</Text>
            <Text style={s.summary}>{data.summaryEn}</Text>
          </>
        )}

        {data.experiences.length > 0 && (
          <>
            <Text style={s.section}>Work Experience</Text>
            {data.experiences.map((e, i) => (
              <View key={i} style={s.expRow}>
                <Text style={s.expTitle}>
                  {e.title} {e.employer ? `— ${e.employer}` : ""}
                </Text>
                <Text style={s.expMeta}>
                  {[e.location, [e.startDate, e.endDate].filter(Boolean).join(" – ")]
                    .filter(Boolean)
                    .join("  ·  ")}
                </Text>
                {e.descriptionEn && <Text style={s.expDesc}>{e.descriptionEn}</Text>}
              </View>
            ))}
          </>
        )}

        {data.skills.length > 0 && (
          <>
            <Text style={s.section}>Skills</Text>
            <View style={s.skillsRow}>
              {data.skills.map((sk, i) => (
                <Text key={i} style={s.skill}>
                  {sk}
                </Text>
              ))}
            </View>
          </>
        )}
      </Page>
    </Document>
  );
}
