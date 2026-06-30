## Diagnóstico

Investiguei o app de quatro ângulos. Os principais gargalos:

**Banco (medido via slow_queries — top ofensores por tempo total):**
- `jobs WHERE imported_at >= ?` — 1.381 chamadas, **18,4s acumulados**, 13ms médios. Sem índice em `imported_at`.
- `jobs ORDER BY posted_date DESC NULLS LAST LIMIT/OFFSET` — 412 chamadas, **5,3s**. Sem índice em `posted_date`.
- `applications WHERE responded_at >= ?` — 3.858 chamadas, 1,2s. Sem índice em `responded_at`.
- `applications ORDER BY` em listas do dono — sem índice composto `(owner_id, sent_at DESC)`.

**Data fetching (estrutural):**
- **Zero rotas** usam `ensureQueryData` + `useSuspenseQuery` (o padrão recomendado pelo TanStack Start).
- 13 rotas autenticadas usam `useQuery` + `isLoading` no render, criando spinners em cascata e bloqueando o paint inicial.
- Só 4 rotas (vagas/perfil público) têm `loader`. Em todas as outras, o componente monta vazio, faz fetch e re-renderiza.
- `useEffect` ausente do grep — bom, mas o problema migrou pra `useQuery` puro.

**Bundle / frontend:**
- **Nenhum `React.lazy` ou `createLazyFileRoute`** no projeto.
- `recharts` e `@react-pdf/renderer` (libs pesadas, ~200kb+ cada gzip) são importados estaticamente por rotas como `admin.seo`, `app.auditoria`, `app.curriculo`, `app.video`, `app.visto`. Quem entra em `/` paga por isso.
- Arquivos enormes: `app.auditoria.tsx` (1.471 linhas), `app.ingles.$module.$lesson.tsx` (1.021), `app.vagas.tsx` (900) — chunks gordos.

**SSR / hidratação:**
- Console mostra **hydration mismatch** em `<html style="color-scheme:light">` — algum provider/tema está injetando atributo só no cliente. Bloqueia o React de patchear a árvore e causa re-render completo.

---

## O que vou fazer

### Fase 1 — Banco (maior ROI, baixíssimo risco)
Migração com índices nos campos das queries mais lentas. Tudo `CREATE INDEX` simples (sem `CONCURRENTLY` — migrations rodam em transação).

```sql
CREATE INDEX IF NOT EXISTS idx_jobs_imported_at      ON public.jobs (imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_date      ON public.jobs (posted_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_apps_owner_sent       ON public.applications (owner_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_owner_responded  ON public.applications (owner_id, responded_at) WHERE responded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_apps_owner_followup   ON public.applications (owner_id, follow_up_due_at) WHERE responded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apps_thread           ON public.applications (owner_id, gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saved_jobs_owner      ON public.saved_jobs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visa_items_owner_sort ON public.visa_checklist_items (owner_id, sort_order);
```

Espero ~5× a 50× nas queries acima (count em índice vs scan).

### Fase 2 — Padrão canônico de fetching (4–6 rotas mais visitadas)
Migrar das mais visitadas primeiro: `app.index`, `app.vagas`, `app.candidaturas`, `app.curriculo`. Para cada uma:

1. Extrair fetch para um `queryOptions` reusável.
2. `loader: ({ context }) => context.queryClient.ensureQueryData(opts)` no route.
3. Trocar `useQuery` por `useSuspenseQuery` no componente (some o `isLoading`, vira `<Suspense>`).
4. `staleTime` adequado por entidade (60s para perfil, 30s para listas, 0 para feed de empregos).

Deixo as rotas raras (`admin.*`, `auditoria`) no padrão atual nessa fase pra não inflar o diff.

### Fase 3 — Code-splitting de libs pesadas
- Converter imports de `@react-pdf/renderer`, `recharts` e os componentes `*Pdf.tsx` para **import dinâmico** (`await import(...)`) acionado por evento (botão "Baixar PDF" / abrir gráfico).
- Resultado: rotas que só *podem* gerar PDF não carregam a lib até o usuário clicar.
- Aplicar `loading="lazy"` e `decoding="async"` em `<img>` fora do viewport inicial; manter eager + `fetchpriority="high"` no LCP da home.
- Preload do hero da `/` via `head().links` da route raiz da home.

### Fase 4 — Hidratação
- Localizar o setter de `style="color-scheme"` em `<html>` (provável `next-themes` / theme-provider rodando antes da hidratação).
- Mover para `useEffect` no cliente OU pré-renderizar o atributo no servidor (`__root.tsx` head/html attrs) pra bater dos dois lados.
- Remove o erro do console e elimina o re-render que invalida toda a árvore.

### Fase 5 — Defaults do QueryClient
Já está com `defaultPreloadStaleTime: 0` (correto). Vou afinar:
- `retry: 1` com backoff só pra rede/5xx (já feito no error-handling anterior — confirmo).
- `refetchOnWindowFocus: false` em listas que mudam pouco (perfil, vagas salvas).
- `gcTime` maior em queries de referência (módulos de inglês).

---

## Detalhes técnicos

**Risco / reversibilidade**
- Índices: zero risco, baixo custo, sempre reversíveis (`DROP INDEX`).
- Migração de loader/Suspense: precisa de `errorComponent` + `pendingComponent` em cada rota tocada (já existem defaults no router via `defaultErrorComponent`/`defaultNotFoundComponent`, mas adiciono `pendingComponent` por rota onde fizer sentido).
- Import dinâmico de PDF/recharts: adiciona um pequeno delay no primeiro clique do botão; visualmente compenso com um spinner inline.

**Não vou fazer agora (fica em backlog se quiser depois)**
- Quebrar `app.auditoria.tsx` (1.471 linhas) em componentes menores — refactor estético, não tem ganho de runtime relevante depois do code-split.
- Migrar para Cloudflare Image Resizing — exige configuração de domínio e é fora do escopo.
- Mexer no compute do Lovable Cloud — só recomendo se os índices não resolverem; me parece prematuro.

**O que vou medir depois**
- Re-rodar `slow_queries` após Fase 1 — espero ver `jobs imported_at` cair pra <1ms médio.
- Network tab nas 4 rotas migradas — confirmar 1 request paralelo no loader (e não cascata).
- Tamanho do chunk inicial — espero queda de >30% após Fase 3.

---

Posso seguir nessa ordem (banco → fetching → bundle → hidratação)? Se quiser pular alguma fase ou priorizar diferente, me diga antes de eu começar.