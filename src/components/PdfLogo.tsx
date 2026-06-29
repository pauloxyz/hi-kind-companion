import { Image, View, Text, StyleSheet } from "@react-pdf/renderer";
import logoUrl from "@/assets/vaiprala-logo.png";

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  img: { width: 80, height: 24, objectFit: "contain" },
  imgSm: { width: 60, height: 18, objectFit: "contain" },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 36,
    right: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
  },
  footerText: { fontSize: 8, color: "#888" },
});

/** Inline logo (use inside headers). */
export function PdfLogo({ small = false }: { small?: boolean }) {
  return <Image src={logoUrl} style={small ? s.imgSm : s.img} />;
}

/** Fixed footer with logo + site URL, repeats on every page. */
export function PdfBrandedFooter({ note }: { note?: string }) {
  return (
    <View style={s.footer} fixed>
      <Image src={logoUrl} style={s.imgSm} />
      <Text style={s.footerText}>{note ?? "vaiprala.net · feito com V+ USA"}</Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
      />
    </View>
  );
}

export { logoUrl };
