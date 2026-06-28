import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { checkRateLimit, enforceRateLimit, RateLimitError } from "./rate-limit.server";

describe("rate-limit", () => {
  beforeEach(() => rpcMock.mockReset());

  it("allows when rpc returns true", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await checkRateLimit("k", 5, 60)).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("check_rate_limit", {
      _key: "k",
      _max: 5,
      _window_seconds: 60,
    });
  });

  it("denies when rpc returns false", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    expect(await checkRateLimit("k", 5, 60)).toBe(false);
  });

  it("fails OPEN on rpc error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await checkRateLimit("k", 5, 60)).toBe(true);
  });

  it("fails OPEN when rpc throws", async () => {
    rpcMock.mockImplementation(() => Promise.reject(new Error("net")));
    expect(await checkRateLimit("k", 5, 60)).toBe(true);
  });

  it("enforceRateLimit throws RateLimitError when blocked", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await expect(enforceRateLimit("k", 1, 60)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("enforceRateLimit resolves when allowed", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await expect(enforceRateLimit("k", 1, 60)).resolves.toBeUndefined();
  });
});
