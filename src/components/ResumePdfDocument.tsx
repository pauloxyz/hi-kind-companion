import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { logoUrl } from "./PdfLogo";

const NAVY = "#1a3a6e";
const CREAM = "#faf3e7";
const SIDEBAR_W = "33%";

const s = StyleSheet.create({
  page: { flexDirection: "row", fontFamily: "Helvetica", fontSize: 10, color: "#111" },
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: NAVY,
    color: "#fff",
    padding: 18,
  },
  main: {
    width: "67%",
    backgroundColor: CREAM,
    padding: 24,
  },
  avatarWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#0f2447",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    alignSelf: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 110, height: 110 },
  avatarInitials: { color: "#fff", fontSize: 38, fontFamily: "Helvetica-Bold" },
  sideSectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#fff",
    letterSpacing: 1.2,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#fff",
    marginTop: 16,
    marginBottom: 8,
  },
  sideText: { color: "#fff", fontSize: 9.5, marginBottom: 4, lineHeight: 1.4 },
  sideBullet: { color: "#fff", fontSize: 9.5, marginBottom: 3, lineHeight: 1.4 },
  name: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    color: "#111",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  jobLine: {
    fontSize: 11,
    textAlign: "center",
    color: "#555",
    marginBottom: 18,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  mainSectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: NAVY,
    paddingBottom: 2,
  },
  summary: { fontSize: 10, lineHeight: 1.5, marginBottom: 4, textAlign: "justify" },
  expRow: { marginBottom: 10 },
  expTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: NAVY },
  expMeta: { fontSize: 9, color: "#666", marginBottom: 3, fontStyle: "italic" },
  expDesc: { fontSize: 9.5, lineHeight: 1.45, textAlign: "justify" },

  // Page 2
  photosTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 14,
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoCell: {
    width: "48.5%",
    height: 165,
    marginBottom: 8,
    backgroundColor: "#ddd",
    overflow: "hidden",
    borderRadius: 6,
  },
  photoImg: { width: "100%", height: "100%", objectFit: "cover" },
  photoCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(26,58,110,0.85)",
    color: "#fff",
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
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
  /** Optional avatar (data URI or URL). */
  avatarUrl?: string;
  /** Up to 6 photos (data URIs or URLs). */
  resumePhotos?: Array<{ url: string; caption?: string | null }>;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function Sidebar({ data }: { data: ResumePdfData }) {
  return (
    <View style={s.sidebar}>
      <Image src={logoUrl} style={{ width: 90, height: 28, objectFit: "contain", alignSelf: "center", marginBottom: 12 }} />
      <View style={s.avatarWrap}>
        {data.avatarUrl ? (
          <Image src={data.avatarUrl} style={s.avatarImg} />
        ) : (
          <Text style={s.avatarInitials}>{initials(data.fullName) || "?"}</Text>
        )}
      </View>

      <Text style={s.sideSectionTitle}>Contact</Text>
      {data.email && <Text style={s.sideText}>{data.email}</Text>}
      {data.phone && <Text style={s.sideText}>{data.phone}</Text>}
      {(data.city || data.country) && (
        <Text style={s.sideText}>{[data.city, data.country].filter(Boolean).join(", ")}</Text>
      )}

      {data.skills.length > 0 && (
        <>
          <Text style={s.sideSectionTitle}>Skills</Text>
          {data.skills.map((sk, i) => (
            <Text key={i} style={s.sideBullet}>• {sk}</Text>
          ))}
        </>
      )}

      {data.education && (
        <>
          <Text style={s.sideSectionTitle}>Education</Text>
          <Text style={s.sideText}>{data.education}</Text>
        </>
      )}

      {data.languages && data.languages.length > 0 && (
        <>
          <Text style={s.sideSectionTitle}>Languages</Text>
          {data.languages.map((l, i) => (
            <Text key={i} style={s.sideBullet}>• {l}</Text>
          ))}
        </>
      )}

      {data.availability && (
        <>
          <Text style={s.sideSectionTitle}>Availability</Text>
          <Text style={s.sideText}>{data.availability}</Text>
        </>
      )}
    </View>
  );
}

export function ResumePdfDocument({ data }: { data: ResumePdfData }) {
  const photos = (data.resumePhotos ?? []).slice(0, 6);
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Sidebar data={data} />
        <View style={s.main}>
          <Text style={s.name}>{data.fullName || "—"}</Text>
          {data.headline && <Text style={s.jobLine}>{data.headline}</Text>}

          {data.summaryEn && (
            <>
              <Text style={s.mainSectionTitle}>Profile</Text>
              <Text style={s.summary}>{data.summaryEn}</Text>
            </>
          )}

          {data.experiences.length > 0 && (
            <>
              <Text style={s.mainSectionTitle}>Professional Experience</Text>
              {data.experiences.slice(0, 5).map((e, i) => (
                <View key={i} style={s.expRow} wrap={false}>
                  <Text style={s.expTitle}>
                    {e.title}
                    {e.employer ? ` · ${e.employer}` : ""}
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
        </View>
      </Page>

      {photos.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <Sidebar data={data} />
          <View style={s.main}>
            <Text style={s.photosTitle}>Records from my professional experience</Text>
            <View style={s.photosGrid}>
              {photos.map((p, i) => (
                <View key={i} style={s.photoCell}>
                  <Image src={p.url} style={s.photoImg} />
                  {p.caption && <Text style={s.photoCaption}>{p.caption}</Text>}
                </View>
              ))}
            </View>
          </View>
        </Page>
      )}
    </Document>
  );
}
