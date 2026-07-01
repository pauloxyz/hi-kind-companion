/**
 * Testes do helper `verifyCronSecret` — garante que:
 *   - Rejeita quando CRON_SECRET não está configurado no ambiente.
 *   - Rejeita quando não há header `x-cron-secret` nem `apikey`.
 *   - Rejeita segredo errado (inclusive tamanho diferente).
 *   - Aceita com o header `x-cron-secret` correto.
 *   - Aceita com o header legado `apikey` correto.
 *   - `unauthorizedCronResponse` retorna 401 JSON.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { verifyCronSecret, unauthorizedCronResponse } from "./cron-auth.server";

const CORRECT = "s".repeat(64);

describe("verifyCronSecret", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = CORRECT;
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  const mkReq = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/public/hooks/x", {
      method: "POST",
      headers,
    });

  it("rejects when CRON_SECRET env var is missing", () => {
    delete process.env.CRON_SECRET;
    const r = verifyCronSecret(mkReq({ "x-cron-secret": CORRECT }));
    expect(r).toEqual({ ok: false, reason: "missing_secret_env" });
  });

  it("rejects when no auth header is present", () => {
    const r = verifyCronSecret(mkReq());
    expect(r).toEqual({ ok: false, reason: "missing_header" });
  });

  it("rejects a wrong secret of same length", () => {
    const r = verifyCronSecret(mkReq({ "x-cron-secret": "x".repeat(64) }));
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a wrong secret of different length (timing-safe padding)", () => {
    const r = verifyCronSecret(mkReq({ "x-cron-secret": "x" }));
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an empty header", () => {
    // Undici trata header vazio como "não presente" — o resultado esperado
    // é `missing_header`, o que ainda satisfaz o contrato de segurança.
    const r = verifyCronSecret(mkReq({ "x-cron-secret": "" }));
    expect(r.ok).toBe(false);
    expect(["missing_header", "mismatch"]).toContain(
      (r as { reason: string }).reason,
    );
  });

  it("accepts the correct secret via x-cron-secret header", () => {
    const r = verifyCronSecret(mkReq({ "x-cron-secret": CORRECT }));
    expect(r).toEqual({ ok: true, presented: "x-cron-secret" });
  });

  it("accepts the correct secret via legacy apikey header", () => {
    const r = verifyCronSecret(mkReq({ apikey: CORRECT }));
    expect(r).toEqual({ ok: true, presented: "apikey" });
  });

  it("prefers x-cron-secret when both headers are present", () => {
    const r = verifyCronSecret(
      mkReq({ "x-cron-secret": CORRECT, apikey: "wrong-value" }),
    );
    expect(r).toEqual({ ok: true, presented: "x-cron-secret" });
  });
});

describe("unauthorizedCronResponse", () => {
  it("returns 401 JSON with the reason", async () => {
    const res = unauthorizedCronResponse("mismatch");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ error: "unauthorized", reason: "mismatch" });
  });
});
