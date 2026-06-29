/**
 * Specific contract guard for the admin spike-config server fns.
 *
 * Requirement: both `getAdminSpikeConfig` and `updateAdminSpikeConfig` MUST
 *  - use the `requireSupabaseAuth` middleware,
 *  - call `assertAdminWithAudit(...)` inside the handler,
 *  - never short-circuit with an inline `has_role` rpc or local assertAdmin.
 *
 * If any of these guarantees is removed the test fails — a non-admin caller
 * could otherwise receive a 2xx response.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const FILE = join(process.cwd(), "src/lib/security-admin.functions.ts");
const SRC = readFileSync(FILE, "utf8");

function exportBlock(name: string): string {
  // Grab from `export const <name>` until the next top-level `export const ` or EOF.
  const start = SRC.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`export ${name} not found in security-admin.functions.ts`);
  const after = SRC.indexOf("\nexport const ", start + 1);
  return SRC.slice(start, after < 0 ? SRC.length : after);
}

describe.each([
  ["getAdminSpikeConfig"],
  ["updateAdminSpikeConfig"],
])("admin spike-config contract: %s", (name) => {
  const block = exportBlock(name);

  it(`${name} is registered as a createServerFn`, () => {
    expect(block).toMatch(/createServerFn\(\s*\{\s*method:\s*["'](GET|POST)["']/);
  });

  it(`${name} uses requireSupabaseAuth middleware`, () => {
    expect(block).toMatch(/\.middleware\(\s*\[\s*requireSupabaseAuth\s*\]\s*\)/);
  });

  it(`${name} calls assertAdminWithAudit(...) before any data access`, () => {
    expect(block).toMatch(/assertAdminWithAudit\(/);
    // The guard must run BEFORE any supabase.from(...) inside the handler body.
    const handlerStart = block.indexOf(".handler(");
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = block.slice(handlerStart);
    const guardIdx = handler.indexOf("assertAdminWithAudit(");
    const fromIdx = handler.indexOf("supabase.from(");
    expect(guardIdx).toBeGreaterThan(-1);
    if (fromIdx !== -1) expect(guardIdx).toBeLessThan(fromIdx);
  });

  it(`${name} never inlines has_role rpc or a local assertAdmin`, () => {
    expect(/\.rpc\(\s*["']has_role["']/.test(block)).toBe(false);
    expect(/async function assertAdmin\(/.test(block)).toBe(false);
  });
});

describe("admin spike-config: imports are wired correctly", () => {
  it("imports requireSupabaseAuth and assertAdminWithAudit at module scope", () => {
    expect(SRC).toMatch(/from\s+["']@\/integrations\/supabase\/auth-middleware["']/);
    expect(SRC).toMatch(/from\s+["']@\/lib\/admin-guard\.shared["']/);
  });
});
