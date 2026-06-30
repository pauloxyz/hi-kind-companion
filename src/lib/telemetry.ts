// Lightweight client telemetry: structured console logs + optional sinks
// (window.gtag / window.plausible / window.dataLayer) when present.
// Every event carries a correlationId so client + server logs and Sentry
// breadcrumbs can be joined for a single user attempt.

type Props = Record<string, unknown>;

type GtagFn = (cmd: "event", name: string, params?: Props) => void;
type PlausibleFn = (name: string, opts?: { props?: Props }) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    plausible?: PlausibleFn;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

/** RFC4122-ish v4 id. crypto.randomUUID() when available, fallback otherwise. */
export function newCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function track(event: string, props: Props = {}): void {
  const payload = { ...props, at: new Date().toISOString() };
  // Always emit a structured console line — easy to grep in browser/Sentry.
  console.info(`[track] ${event}`, payload);
  if (typeof window === "undefined") return;
  try { window.gtag?.("event", event, payload); } catch { /* ignore */ }
  try { window.plausible?.(event, { props: payload }); } catch { /* ignore */ }
  try { window.dataLayer?.push({ event, ...payload }); } catch { /* ignore */ }
}
