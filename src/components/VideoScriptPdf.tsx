import { Document, Page as PdfPage, Text, View, StyleSheet, Image as PdfImage } from "@react-pdf/renderer";
import { PdfBrandedFooter, PdfLogo } from "@/components/PdfLogo";
import type { ScriptBlock } from "@/lib/video-script.functions";

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 11, color: "#111" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4, color: "#1a3a6e", textAlign: "center" },
  subtitle: { fontSize: 10, color: "#555", textAlign: "center", marginBottom: 14 },
  sectionTitle: {
    fontSize: 12, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: "#1a3a6e",
    padding: 6, marginTop: 14, marginBottom: 8, textAlign: "center",
  },
  ptBlock: { fontSize: 12, lineHeight: 1.6, textAlign: "justify", marginBottom: 6 },
  blockRow: { borderBottom: "1px solid #e2d8c4", paddingVertical: 8, paddingHorizontal: 4 },
  blockHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  blockNum: {
    fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: "#1a3a6e",
    paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, marginRight: 8,
  },
  blockEn: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#111", flexShrink: 1 },
  blockLabel: { fontSize: 8, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  blockPhonetic: { fontSize: 12, color: "#0a5d2e", fontFamily: "Helvetica-Oblique", marginBottom: 2 },
  blockPt: { fontSize: 10, color: "#555" },
  blockIntonation: { fontSize: 10, color: "#7a4a00", fontFamily: "Helvetica-Oblique" },
  tip: {
    fontSize: 9, color: "#555", backgroundColor: "#fef6e4",
    padding: 8, marginBottom: 10, borderRadius: 3,
  },
  qrBox: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 10,
    backgroundColor: "#f5ede0", borderRadius: 4,
  },
  qrImg: { width: 90, height: 90 },
  qrText: { fontSize: 10, color: "#1a3a6e", flexShrink: 1, lineHeight: 1.4 },
  footer: { fontSize: 9, color: "#666", marginTop: 16, textAlign: "center", fontStyle: "italic" },
});

export function VideoScriptPdf({
  pt, en, blocks, name, qrDataUrl, secondsPerBlock,
}: {
  pt: string; en: string; blocks: ScriptBlock[]; name: string;
  qrDataUrl: string | null; secondsPerBlock: number;
}) {
  const totalSec = Math.round(blocks.length * secondsPerBlock);
  return (
    <Document>
      <PdfPage size="LETTER" style={s.page} wrap>
        <View style={{ alignItems: "center", marginBottom: 8 }}><PdfLogo /></View>
        <Text style={s.title}>Roteiro do vídeo — {name}</Text>
        <Text style={s.subtitle}>
          Treine bloco por bloco. Leia a pronúncia "abrasileirada" — não tente ler o inglês escrito.
        </Text>

        <View style={s.tip}>
          <Text>
            Repita cada bloco 5x antes de passar pro próximo. Quando souber 3 blocos seguidos sem olhar, junte-os.
          </Text>
        </View>

        <Text style={s.sectionTitle}>Roteiro em português (entenda primeiro)</Text>
        <Text style={s.ptBlock}>{pt}</Text>

        <Text style={s.sectionTitle}>Roteiro em inglês (texto corrido)</Text>
        <Text style={s.ptBlock}>{en}</Text>

        {qrDataUrl && (
          <View style={s.qrBox}>
            <PdfImage src={qrDataUrl} style={s.qrImg} />
            <Text style={s.qrText}>
              Aponte a câmera no QR code e abra o MODO PRÁTICA — ouça cada bloco e repita junto.
              Ritmo: ~{secondsPerBlock}s por bloco (~{totalSec}s total).
            </Text>
          </View>
        )}

        <PdfBrandedFooter />
      </PdfPage>

      <PdfPage size="LETTER" style={s.page} wrap>
        <View style={{ alignItems: "center", marginBottom: 8 }}><PdfLogo /></View>
        <Text style={s.title}>Blocos de treino</Text>
        <Text style={s.subtitle}>
          Cubra o inglês com o dedo e treine só pela pronúncia (verde). Laranja = ritmo/entonação.
        </Text>

        {blocks.length === 0 ? (
          <View style={s.tip}><Text>Não foi possível gerar os blocos. Volte ao app e clique em "Gerar de novo".</Text></View>
        ) : (
          blocks.map((b, i) => (
            <View key={i} style={s.blockRow} wrap={false}>
              <View style={s.blockHeader}>
                <Text style={s.blockNum}>{String(i + 1).padStart(2, "0")}</Text>
                <Text style={s.blockEn}>{b.en}</Text>
              </View>
              <Text style={s.blockLabel}>Como falar (leia em voz alta)</Text>
              <Text style={s.blockPhonetic}>{b.phonetic}</Text>
              <Text style={s.blockLabel}>Entonação / ritmo</Text>
              <Text style={s.blockIntonation}>{b.intonation}</Text>
              <Text style={s.blockLabel}>Significado</Text>
              <Text style={s.blockPt}>{b.pt}</Text>
            </View>
          ))
        )}

        <PdfBrandedFooter />
      </PdfPage>
    </Document>
  );
}
