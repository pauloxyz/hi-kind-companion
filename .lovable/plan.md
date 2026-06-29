## Objetivo

Painel `/admin/seo` (restrito a `has_role('admin')`) com histórico de execuções, tendência de findings por severidade, taxa de testes SEO passando e cobertura de rotas no sitemap, alimentado por um job diário.

## Arquitetura

```text
pg_cron (diário 03:00 UTC)
        │
        ▼
POST /api/public/hooks/seo-scan        ← rota TanStack pública (apikey)
        │
        ▼
runSeoChecks()                          ← lógica reusada de sitemap-entries.ts
        │
        ▼
INSERT public.seo_scan_runs (admin)    ← service role no handler
        │
        ▼
listSeoRuns()  (server fn auth+admin)  ── /admin/seo (React + Recharts)
```

## Passos

1. **Migration `seo_scan_runs`**
   - Colunas: `id uuid pk`, `created_at timestamptz default now()`, `source text check in ('cron','manual')`, `tests_total/passed/failed int`, `critical/high/medium/low int`, `routes_total/routes_in_sitemap int`, `duration_ms int`, `details jsonb`.
   - GRANT `SELECT` para `authenticated`, `ALL` para `service_role`. RLS habilitado, política única: `SELECT` permitido apenas se `has_role(auth.uid(),'admin')`. Sem `INSERT` policy — inserções só via service role no hook.
   - Index `idx_seo_scan_runs_created_at desc`.

2. **`src/lib/seo-runner.ts`** (server-only)
   - Função `runSeoChecks()` retorna `{ tests, severityCounts, routesTotal, routesInSitemap, durationMs }`.
   - Reusa `STATIC_SITEMAP_ENTRIES` de `src/lib/sitemap-entries.ts` e importa `routeTree` de `src/routeTree.gen.ts` para extrair rotas públicas.
   - Cada check tem `severity` (`critical` = sitemap, `high` = structured-data, `medium` = robots/canonical, `low` = meta).

3. **`src/routes/api/public/hooks/seo-scan.ts`**
   - `POST` valida header `apikey` contra anon key, chama `runSeoChecks()`, insere via `supabaseAdmin` (lazy import). Retorna `{ ok, runId }`.

4. **`src/lib/seo-runs.functions.ts`**
   - `listSeoRuns`: `requireSupabaseAuth` + verifica `has_role(userId,'admin')` via `context.supabase.rpc`; retorna últimas 90 execuções.
   - `triggerManualScan`: mesma guarda admin, chama `runSeoChecks` e insere com `source='manual'`.

5. **Rota admin `src/routes/_authenticated/admin.seo.tsx`**
   - Layout: header com botão "Rodar scan agora", 4 KPI cards (último scan, % testes passando, findings críticos, cobertura sitemap), e 3 gráficos Recharts:
     - LineChart: findings por severidade (críticos/altos/médios/baixos) ao longo do tempo.
     - AreaChart: taxa de testes passando.
     - BarChart: rotas no sitemap vs rotas totais por scan.
   - Tabela com últimas 20 execuções (data, origem, testes, severidades, duração).
   - Estado vazio se ainda não houver runs.
   - Loader chama `listSeoRuns` via `ensureQueryData` + `useSuspenseQuery`.

6. **Cron via `supabase--insert`**
   - `cron.schedule('seo-scan-daily','0 3 * * *', net.http_post(url:='https://project--bfc1be60-9598-46b5-b328-4a163d63ef93.lovable.app/api/public/hooks/seo-scan', headers, body:='{}'))`.
   - Habilita `pg_cron` e `pg_net` se necessário.

## Detalhes técnicos

- Recharts já está disponível (shadcn padrão); se não estiver, `bun add recharts`.
- `routeTree.gen.ts` é importável no servidor; usamos `Object.keys(routeTree.routesById)` filtrando `_authenticated`, `__root`, `$`, `/api/`.
- Rota admin fica sob `_authenticated/`, então a layout gate cuida do login; a checagem de role é feita no server fn (UI mostra "Acesso restrito" se 403).
- Hook público segue padrão `apikey` (sem novo segredo).
- Sem alterações em arquivos auto-gerados; sem mexer em testes existentes.

## Arquivos

- Novo: migration SQL, `src/lib/seo-runner.ts`, `src/lib/seo-runs.functions.ts`, `src/routes/api/public/hooks/seo-scan.ts`, `src/routes/_authenticated/admin.seo.tsx`.
- Editado: nenhum arquivo existente além do routeTree (auto-gen).
