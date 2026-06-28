# Segurança do app

> Documento vivo. Editado por humanos + agente. Última atualização: 2026-06-28.

## Visão geral

A camada de segurança tem três objetivos:
1. **Confidencialidade** — PII (telefone, data de nascimento, e-mails de contato) nunca vaza para anônimos.
2. **Integridade** — apenas admins escrevem em tabelas administrativas; usuários só veem/editam seus próprios dados.
3. **Detecção** — toda ação sensível gera entrada em `public.security_audit_log`; alertas de risco agregam por hora/IP.

## Modelo de ameaças

| Ator | Capacidade | Mitigação |
|------|-----------|-----------|
| Scraper anônimo | HTTP público, Data API com chave publishable | RLS estrita + grants column-level revogados para PII |
| Usuário malicioso autenticado | Pode tentar elevar privilégios | `user_roles` separado, policy admin não permite auto-promoção |
| Atacante de força bruta | Tenta listas de senhas vazadas | HIBP ligado, log `auth_failure`, view `security_risk_alerts` |
| Conta comprometida | Roubo de senha | 2FA TOTP opcional, re-auth para email/exclusão, sign-out global |
| Admin malicioso | Acesso ao painel de auditoria | Toda ação admin auditada com `admin_action` + resource |

## Camadas de defesa

### 1. RLS + column-level grants
- Tabelas com `owner_id` têm policy `auth.uid() = owner_id` (SELECT/UPDATE/DELETE/INSERT).
- `my_profile.public_page_enabled = true` libera leitura anônima — **mas** `phone` e `birth_date` foram revogadas explicitamente do role `anon`.
- `jobs` é público; `recruitment_email/phone/contact_name` revogados de `anon`.
- `profile_views`: dono lê tudo exceto `viewer_ip`/`user_agent`, que só service_role consegue.

### 2. Auth hardening (Lovable Cloud)
- HIBP (Have I Been Pwned) **ligado** — senhas vazadas são bloqueadas no signup e no change-password.
- Senha mínima 12 chars (config no painel Cloud).
- Auto-confirm email **desligado** — confirmação obrigatória.
- Sign-up anônimo **desligado**.

### 3. Re-autenticação para ações sensíveis
- Troca de email → exige senha atual via `changeEmailWithReauth` (server fn).
- Exclusão de conta → exige senha atual + "EXCLUIR" via `deleteOwnAccount` (server fn que usa `supabaseAdmin.auth.admin.deleteUser`).
- Falhas de re-auth viram evento `reauth_failed`.

### 4. MFA TOTP (opcional)
- `src/lib/account-mfa.ts` envolve `supabase.auth.mfa.*`.
- Card em `/app/configuracoes` permite enrolar Google Authenticator / 1Password / Authy.
- Removível pelo próprio usuário.

### 5. Auditoria + alertas
- Toda ação sensível chama `logSecurityEvent` (anônimo, pré-auth) ou `logAccountEvent` / `logPiiAccess` (autenticado).
- `security_risk_alerts` (view) agrega por hora/IP — `risk_level=high` quando ≥10 falhas de auth ou ≥20 eventos.
- Painel `/app/auditoria` (admin) mostra KPIs, eventos, alertas, retenção, com paginação/ordenação/busca e export CSV/PDF.
- Alertas "tratados" persistem em `security_alert_acks` (não mais localStorage), com nota e quem tratou.

### 6. Retenção configurável
- Tabela `security_retention_policy` mapeia `event_type → retain_days` (7 a 3650).
- `purge_security_audit_log()` roda diariamente às 03:00 (pg_cron) e respeita a política por tipo.
- Padrões: eventos sensíveis (HIBP, falhas) 365 dias; preferências 30 dias; admin/exclusão 730+ dias.

### 7. Sessões
- "Encerrar todas as outras sessões" → `signOutEverywhere` server fn chama `supabaseAdmin.auth.admin.signOut(userId, 'global')`.

### 8. Healthcheck
- `GET /api/public/health` → JSON `{ status, checks: { database: { ok, latency_ms } } }`.
- Retorna 503 quando o banco está degradado.

## Runbook — Alerta HIGH em `security_risk_alerts`

1. **Acessar** `/app/auditoria` → aba **Alertas de Risco**.
2. **Identificar** o IP e a janela (hora).
3. **Buscar** o IP na aba **Eventos** para ver o tipo (HIBP? falha de auth? scanning?).
4. **Bloquear** o IP no CDN/firewall se confirmar abuso.
5. **Notificar** o usuário afetado, se houver email_hash batendo com conta real (forçar reset).
6. **Tratar** o alerta — botão "Tratar" → adicionar nota com a ação tomada.
7. Se padrão recorrente: ajustar retenção daquele `event_type` para guardar mais histórico.

## Gaps conhecidos

- **Rate limiting** — a plataforma ainda não expõe primitiva oficial. Quando disponível, aplicar em `logSecurityEvent` e endpoints de auth (10 req/min/IP).
- **Notificação automática por email de HIGH alerts** — pg_cron hook pronto para implementar; pendente definição do destinatário (email do admin owner ou lista).
- **Bloqueio automático de IP** — manual hoje; quando integrarmos Cloudflare WAF API, bloqueio vira automático em risk_level=high.

## Como rodar os testes

```bash
bun install
bunx vitest run            # unitários
bunx playwright test       # smoke E2E
bunx tsgo --noEmit         # typecheck estrito
```

CI roda automaticamente (`.github/workflows/ci.yml`) em todo push/PR para `main`.
