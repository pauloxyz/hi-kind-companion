import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertAdminWithAudit } from "./admin-guard.shared";

function makeCtx(opts: { isAdmin: boolean; rpcRoleError?: boolean; denialThrows?: boolean }) {
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const ctx = {
    userId: "user-123",
    supabase: {
      rpc: vi.fn(async (name: string, params: Record<string, unknown>) => {
        rpcCalls.push({ name, params });
        if (name === "has_role") {
          return opts.rpcRoleError
            ? { data: null, error: { message: "rpc fail" } }
            : { data: opts.isAdmin, error: null };
        }
        if (name === "record_admin_denial") {
          if (opts.denialThrows) throw new Error("log unavailable");
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
    },
  };
  return { ctx, rpcCalls };
}

describe("assertAdminWithAudit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes silently when user is admin and does NOT log anything", async () => {
    const { ctx, rpcCalls } = makeCtx({ isAdmin: true });
    await expect(
      assertAdminWithAudit(ctx as never, "route:/admin/seo"),
    ).resolves.toBeUndefined();
    expect(rpcCalls.map((c) => c.name)).toEqual(["has_role"]);
  });

  it("throws Forbidden and calls record_admin_denial when user is not admin", async () => {
    const { ctx, rpcCalls } = makeCtx({ isAdmin: false });
    await expect(
      assertAdminWithAudit(ctx as never, "route:/admin/seo"),
    ).rejects.toThrow("Forbidden");
    expect(rpcCalls.map((c) => c.name)).toEqual(["has_role", "record_admin_denial"]);
    expect(rpcCalls[1].params).toEqual({ _resource: "route:/admin/seo" });
  });

  it("throws 'role check failed' on rpc error and does NOT log a denial", async () => {
    const { ctx, rpcCalls } = makeCtx({ isAdmin: false, rpcRoleError: true });
    await expect(
      assertAdminWithAudit(ctx as never, "any.fn"),
    ).rejects.toThrow("role check failed");
    expect(rpcCalls.map((c) => c.name)).toEqual(["has_role"]);
  });

  it("never throws because of a denial-log failure (best effort)", async () => {
    const { ctx } = makeCtx({ isAdmin: false, denialThrows: true });
    await expect(
      assertAdminWithAudit(ctx as never, "fn.x"),
    ).rejects.toThrow("Forbidden");
  });
});
