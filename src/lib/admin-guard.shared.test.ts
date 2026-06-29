import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertAdminWithAudit } from "./admin-guard.shared";

function makeCtx(opts: { isAdmin: boolean; rpcError?: boolean }) {
  const inserts: Array<Record<string, unknown>> = [];
  const ctx = {
    userId: "user-123",
    supabase: {
      rpc: vi.fn(async () =>
        opts.rpcError
          ? { data: null, error: { message: "rpc fail" } }
          : { data: opts.isAdmin, error: null },
      ),
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (row: Record<string, unknown>) => {
          inserts.push({ table, ...row });
          return { error: null };
        }),
      })),
    },
  };
  return { ctx, inserts };
}

describe("assertAdminWithAudit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes silently when user is admin", async () => {
    const { ctx, inserts } = makeCtx({ isAdmin: true });
    await expect(
      assertAdminWithAudit(ctx as never, "route:/admin/seo"),
    ).resolves.toBeUndefined();
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("has_role", {
      _user_id: "user-123",
      _role: "admin",
    });
    expect(inserts).toHaveLength(0);
  });

  it("throws Forbidden and audits denial when user is not admin", async () => {
    const { ctx, inserts } = makeCtx({ isAdmin: false });
    await expect(
      assertAdminWithAudit(ctx as never, "route:/admin/seo"),
    ).rejects.toThrow("Forbidden");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: "security_audit_log",
      event_type: "admin_access_denied",
      user_id: "user-123",
      resource: "route:/admin/seo",
      severity: "medium",
    });
  });

  it("throws role check failed and does NOT audit on rpc error", async () => {
    const { ctx, inserts } = makeCtx({ isAdmin: false, rpcError: true });
    await expect(
      assertAdminWithAudit(ctx as never, "any.fn"),
    ).rejects.toThrow("role check failed");
    expect(inserts).toHaveLength(0);
  });

  it("never throws because of an audit-log insert failure (best effort)", async () => {
    const ctx = {
      userId: "user-xyz",
      supabase: {
        rpc: vi.fn(async () => ({ data: false, error: null })),
        from: vi.fn(() => ({
          insert: vi.fn(async () => {
            throw new Error("log table unavailable");
          }),
        })),
      },
    };
    await expect(
      assertAdminWithAudit(ctx as never, "fn.x"),
    ).rejects.toThrow("Forbidden");
  });
});
