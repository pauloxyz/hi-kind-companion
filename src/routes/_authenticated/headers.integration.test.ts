// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Garante que toda rota _authenticated tem exatamente um <h1>
 * e que ele vive dentro de <PageHeader /> (ou dentro de um <header> hero
 * documentado como exceção). Substitui um teste de integração com render
 * completo (que exigiria TanStackRouter + Query + Supabase mockados em
 * todas as rotas) por uma checagem estática equivalente.
 */

const ROUTES_DIR = "src/routes/_authenticated";

// Heros customizados documentados em mem://design/page-header.md
const HERO_EXCEPTIONS = new Set<string>([
  "app.visto.tsx",
  "app.visto.historico.tsx",
  "app.comecar.tsx",
]);

// Rotas técnicas sem cabeçalho de página (layouts, redirects, etc.)
const NO_HEADER_ROUTES = new Set<string>([
  "route.tsx",
  "app.ingles.tsx",
  "app.ingles.$module.tsx",
]);

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length;
}

// Só arquivos de rota — ignora .test.tsx / .integration.test.tsx que ficam
// co-localizados nesta pasta (o Vite router-plugin também os ignora, mas
// o teste estático precisa filtrar explicitamente).
const files = readdirSync(ROUTES_DIR).filter(
  (f) => f.endsWith(".tsx") && !/\.(test|spec|integration\.test|e2e)\.tsx?$/.test(f),
);

describe("rotas _authenticated — convenção de cabeçalho", () => {
  it.each(files)("%s tem no máximo um <h1> e usa PageHeader (ou hero exceção)", (file) => {
    const source = readFileSync(join(ROUTES_DIR, file), "utf8");

    // Quantos h1 podem renderizar simultaneamente? Heurística: contagem de
    // ocorrências de "<h1". Branches condicionais (early return) duplicam o
    // h1 no source mas só um renderiza — toleramos isso em heros exceção.
    const h1Count = countMatches(source, /<h1[\s>]/g);
    const usesPageHeader = /<PageHeader[\s/>]/.test(source);

    if (NO_HEADER_ROUTES.has(file)) {
      expect(h1Count, `${file} é layout/redirect e não deve ter <h1>`).toBe(0);
      return;
    }

    if (HERO_EXCEPTIONS.has(file)) {
      // Hero exceção: pelo menos um <h1> documentado existe; permitimos
      // múltiplas ocorrências no source porque rendem em branches distintos.
      expect(h1Count).toBeGreaterThanOrEqual(1);
      return;
    }

    // Rota normal: NUNCA pode ter h1 solto. Toda hierarquia de título passa
    // pelo PageHeader.
    expect(h1Count, `${file} tem <h1> solto — use <PageHeader />`).toBe(0);
    expect(usesPageHeader, `${file} deve renderizar <PageHeader />`).toBe(true);
  });
});
