import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetFilenameCounterForTests,
  buildReprocessLogFilename,
  buildStripeEventsFilename,
  contentDispositionAttachment,
  nextUniqueTimestampSuffix,
  parseFilenameFromContentDisposition,
} from "./export-filename";

const FIXED = new Date("2026-07-02T12:34:56.789Z");

describe("nextUniqueTimestampSuffix", () => {
  beforeEach(() => __resetFilenameCounterForTests());

  it("é determinístico para o primeiro download em um dado ms", () => {
    expect(nextUniqueTimestampSuffix(FIXED)).toBe("2026-07-02-12-34-56-789");
  });

  it("adiciona sufixo monotônico se chamado várias vezes no mesmo ms", () => {
    expect(nextUniqueTimestampSuffix(FIXED)).toBe("2026-07-02-12-34-56-789");
    expect(nextUniqueTimestampSuffix(FIXED)).toBe("2026-07-02-12-34-56-789-1");
    expect(nextUniqueTimestampSuffix(FIXED)).toBe("2026-07-02-12-34-56-789-2");
  });

  it("reseta o contador quando o ms muda", () => {
    nextUniqueTimestampSuffix(FIXED);
    nextUniqueTimestampSuffix(FIXED);
    const next = new Date(FIXED.getTime() + 1);
    expect(nextUniqueTimestampSuffix(next)).toBe("2026-07-02-12-34-56-790");
  });
});

describe("buildStripeEventsFilename", () => {
  beforeEach(() => __resetFilenameCounterForTests());

  it("respeita filtros e formato", () => {
    const name = buildStripeEventsFilename(
      { environment: "live", status: "processed", eventType: "checkout.session.completed" },
      "csv",
      FIXED,
    );
    expect(name).toBe(
      "stripe-webhook-events_live_processed_checkout.session.completed_2026-07-02-12-34-56-789.csv",
    );
  });

  it("garante nomes distintos para dois downloads no mesmo segundo", () => {
    const a = buildStripeEventsFilename({ environment: "all", status: "all" }, "csv", FIXED);
    const b = buildStripeEventsFilename({ environment: "all", status: "all" }, "json", FIXED);
    expect(a).not.toBe(b);
    expect(a.endsWith(".csv")).toBe(true);
    expect(b.endsWith(".json")).toBe(true);
    // Mesmo formato repetido no mesmo ms também precisa diferir.
    const c = buildStripeEventsFilename({ environment: "all", status: "all" }, "csv", FIXED);
    expect(c).not.toBe(a);
  });
});

describe("buildReprocessLogFilename", () => {
  beforeEach(() => __resetFilenameCounterForTests());

  it("gera prefixo correto e sufixo único", () => {
    const a = buildReprocessLogFilename(
      { outcome: "error", stripe_event_id: "evt_123", actor_user_id: "abcdef1234" },
      "json",
      FIXED,
    );
    expect(a).toBe("stripe-reprocess-log_error_evt_123_abcdef12_2026-07-02-12-34-56-789.json");
  });
});

describe("Content-Disposition helpers", () => {
  it("faz round-trip attachment ↔ parse", () => {
    const name = "stripe-webhook-events_live_2026-07-02-12-34-56-789.csv";
    const header = contentDispositionAttachment(name);
    expect(header).toContain(`filename="${name}"`);
    expect(parseFilenameFromContentDisposition(header)).toBe(name);
  });

  it("prefere filename*=UTF-8 quando presente", () => {
    const header = `attachment; filename="fallback.csv"; filename*=UTF-8''r%C3%A9sum%C3%A9.csv`;
    expect(parseFilenameFromContentDisposition(header)).toBe("résumé.csv");
  });

  it("devolve null quando header ausente", () => {
    expect(parseFilenameFromContentDisposition(null)).toBeNull();
    expect(parseFilenameFromContentDisposition("inline")).toBeNull();
  });
});
