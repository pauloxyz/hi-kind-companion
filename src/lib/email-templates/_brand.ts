/**
 * V+ USA brand tokens for transactional/auth emails.
 * Hex values approximating the oklch palette in src/styles.css ("Campo & Colheita").
 * Body background MUST remain #ffffff per email infra rules.
 */
export const brand = {
  primary: "#2d5240", // deep moss green
  primaryHover: "#244233",
  ochre: "#b56d2d", // accent-gold
  red: "#c83a2a", // accent-red
  cream: "#fbf8f1", // page tint
  card: "#ffffff",
  text: "#2a3a32",
  muted: "#6b7568",
  border: "#e8e2d2",
  link: "#2d5240",
};

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const styles = {
  main: {
    backgroundColor: "#ffffff",
    fontFamily: fontStack,
    margin: 0,
    padding: 0,
  } as const,
  container: {
    backgroundColor: brand.card,
    maxWidth: "560px",
    margin: "0 auto",
    padding: "0",
  } as const,
  band: {
    backgroundColor: brand.primary,
    height: "6px",
    borderRadius: "12px 12px 0 0",
  } as const,
  header: {
    padding: "32px 32px 8px",
    backgroundColor: brand.cream,
  } as const,
  brandLine: {
    fontFamily: fontStack,
    fontSize: "13px",
    fontWeight: 700 as const,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: brand.primary,
    margin: 0,
  } as const,
  brandTag: {
    fontFamily: fontStack,
    fontSize: "12px",
    color: brand.ochre,
    margin: "4px 0 0",
    fontWeight: 600 as const,
  } as const,
  body: {
    padding: "24px 32px 8px",
    backgroundColor: brand.card,
  } as const,
  h1: {
    fontFamily: fontStack,
    fontSize: "22px",
    fontWeight: 700 as const,
    color: brand.text,
    margin: "0 0 16px",
    lineHeight: "1.25",
  } as const,
  text: {
    fontFamily: fontStack,
    fontSize: "15px",
    color: brand.text,
    lineHeight: "1.6",
    margin: "0 0 16px",
  } as const,
  button: {
    backgroundColor: brand.primary,
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 600 as const,
    borderRadius: "10px",
    padding: "14px 24px",
    textDecoration: "none",
    display: "inline-block",
    margin: "8px 0 8px",
  } as const,
  link: { color: brand.link, textDecoration: "underline" } as const,
  code: {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: "30px",
    fontWeight: 700 as const,
    letterSpacing: "0.32em",
    color: brand.primary,
    backgroundColor: brand.cream,
    border: `1px solid ${brand.border}`,
    borderRadius: "10px",
    padding: "16px 20px",
    textAlign: "center" as const,
    margin: "12px 0 20px",
  } as const,
  divider: {
    borderTop: `1px solid ${brand.border}`,
    margin: "24px 0 16px",
  } as const,
  footer: {
    fontFamily: fontStack,
    fontSize: "12px",
    color: brand.muted,
    lineHeight: "1.55",
    padding: "0 32px 24px",
    margin: 0,
  } as const,
};

export function Brandheader({ siteName }: { siteName: string }) {
  // Returns inline JSX-friendly strings; templates render their own JSX.
  return { siteName };
}
