# VaiPraLá

App em TanStack Start + Lovable Cloud.

## Desenvolvimento

```bash
bun install
bun dev          # preview em http://localhost:8080
bun run build
```

## Testes unitários

```bash
bunx vitest run
```

## Testes E2E (Playwright)

Os specs ficam em `e2e/` e usam o Chromium empacotado pelo `@playwright/test`.

### Setup único (instalar o navegador)

O script `e2e` já roda `playwright install chromium` antes do `playwright test`,
então normalmente basta:

```bash
npm run e2e
```

Se preferir instalar manualmente (ou em CI sem cache de navegadores):

```bash
npm run e2e:install   # playwright install --with-deps chromium
```

### Sessão autenticada automática

Os specs que precisam de usuário logado (ex.:
`e2e/google-login-redirect.spec.ts`) usam o helper
`e2e/_helpers/auth.ts`, que faz `signIn` direto na Auth REST API do backend
e injeta a sessão no `localStorage` — o mesmo formato que o
`@supabase/supabase-js` persiste após um login normal ou retorno de OAuth.

**Ordem de resolução das credenciais:**

1. Se `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` estiverem ambas definidas, o helper
   usa essas (usuário pré-existente e confirmado).
2. Caso contrário, ele tenta um usuário padrão
   (`playwright+e2e-auto-confirm@vplusa.test` / `Playwright!E2E#2025`):
   - Primeiro tenta `signInWithPassword`.
   - Se o usuário não existir, faz `signUp` e segue logado com o auto-confirm
     de e-mail ligado.
   - Se o usuário já existir, reaproveita a sessão obtida no `signIn` e não
     exige nenhuma etapa manual.

### Variáveis de ambiente

| Variável | Obrigatória? | Descrição |
| --- | --- | --- |
| `E2E_TEST_EMAIL` | Não | E-mail do usuário de teste pré-confirmado. Se omitido, o helper usa o padrão determinístico e provisiona via `signUp`. |
| `E2E_TEST_PASSWORD` | Junto com a anterior | Senha do usuário acima. Omita junto com `E2E_TEST_EMAIL` para usar a senha determinística. |
| `E2E_SUPABASE_URL` | Não | Sobrescreve `VITE_SUPABASE_URL` (raro). |
| `E2E_SUPABASE_PUBLISHABLE_KEY` | Não | Sobrescreve `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| `PLAYWRIGHT_BASE_URL` | Não | Default `http://localhost:8080`. |

Exemplo (Bash/zsh):

```bash
export E2E_TEST_EMAIL='voce+e2e@exemplo.com'
export E2E_TEST_PASSWORD='SenhaForte!2025'
npm run e2e
```

### Como confirmar o e-mail do usuário de teste

A confirmação de e-mail é obrigatória por padrão no Lovable Cloud. Você tem
duas opções:

**Opção A — Auto-confirm (recomendada para ambientes não-prod):**

Cloud → Users → Auth Settings → Email → ligar **Auto-confirm**. Depois disso
o helper provisiona o usuário padrão sozinho e o teste roda sem nenhuma
configuração manual.

**Opção B — Confirmar manualmente uma vez:**

1. Abra `/auth` no preview e faça **Cadastrar** com um e-mail real seu.
2. Abra o link de confirmação que chegou na sua caixa de entrada.
3. Exporte as credenciais antes de rodar os testes:
   ```bash
   export E2E_TEST_EMAIL='voce+e2e@exemplo.com'
   export E2E_TEST_PASSWORD='SenhaForte!2025'
   ```
4. `npm run e2e`.

### Rodando um spec específico

```bash
npx playwright test e2e/google-login-redirect.spec.ts
```

### Em CI

Adicione o passo de install antes de rodar os testes (o script `e2e` já faz
isso, mas em CI costuma valer a pena cachear `~/.cache/ms-playwright`):

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npx playwright test
  env:
    E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
    E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
```

Se esses secrets não existirem, deixe as variáveis ausentes/vazias: o helper
usa automaticamente `playwright+e2e-auto-confirm@vplusa.test` e
`Playwright!E2E#2025`, cria o usuário com auto-confirm e reaproveita a sessão
nas próximas execuções.
