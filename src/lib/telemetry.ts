// Lightweight client telemetry: structured console logs + optional sinks
// (window.gtag / window.plausible / window.dataLayer) when present.
// Use for product analytics events the team wants to monitor (e.g. AI
// retry success rate, 429/402 frequency, wait latency).

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

export function track(event: string, props: Props = {}): void {
  const payload = { ...props, at: new Date().toISOString() };
  // Always emit a structured console line — easy to grep in browser/Sentry.
  console.info(`[track] ${event}`, payload);
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", event, payload);
  } catch { /* ignore */ }
  try {
    window.plausible?.(event, { props: payload });
  } catch { /* ignore */ }
  try {
    window.dataLayer?.push({ event, ...payload });
  } catch { /* ignore */ }
}
