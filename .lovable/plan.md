Vou executar o roteiro em 4 fases, da mais crítica ao polimento. Cada fase termina em estado funcional — se quiser pausar entre fases, o app continua íntegro.

## Fase 1 — Auditoria objetiva e fundações (crítico)

1. **Rodar scan de segurança + linter do banco** e tratar achados (RLS, grants, policies permissivas, colunas PII expostas). Resultado fica registrado.
2. **Endurecer Auth do Supabase**: HIBP ligado, senha mínima 12, OTP curto. Confirmar `redirect_uri` do Google.
3. **Persistir o "tratado" dos alertas de risco** em tabela `security_alert_acks` (RLS admin-only), substituindo o `localStorage`. Inclui nota opcional do admin e auditoria de quem tratou.
4. **Re-autenticação para ações sensíveis** (excluir conta, trocar email) — pede senha atual antes de prosseguir.

## Fase 2 — Resiliência e observabilidade

5. **MFA/TOTP opcional** nas configurações (`supabase.auth.mfa.enroll/challenge/verify`), com seção "Segurança da conta".
6. **Sessões ativas + revogação** — listar dispositivos via `auth.admin` server fn (admin-only para o próprio user) e botão "encerrar sessão".
7. **Notificação de alertas HIGH** via email transacional (conector Google Mail já existe) quando a view `security_risk_alerts` detectar pico — disparado por `pg_cron` horário chamando `/api/public/hooks/risk-alerts`.
8. **Healthcheck público** em `/api/public/health` (status do banco + versão).
9. **Retenção configurável por tipo de evento** — tabela `security_retention_policy` (event_type → dias), `purge_security_audit_log()` lê dela.

## Fase 3 — Dados do usuário e qualidade

10. **Export LGPD/GDPR** — botão "baixar meus dados" nas Configurações gera JSON com todas as tabelas do usuário via server fn autenticada.
11. **CI completo**: adicionar job E2E (Playwright) no `.github/workflows/ci.yml` rodando contra build de preview; vitest já roda.
12. **Cobertura de testes** dos server functions críticos (`security-admin`, `security-audit`, account handlers) — meta 70%+ nesses arquivos.
13. **Error boundaries por rota** + logger estruturado server-side (`console.log` em JSON com `event`, `userId`, `ts`).

## Fase 4 — Polimento

14. **i18n completo** do painel de auditoria e configurações (PT/EN/ES já existem).
15. **Acessibilidade**: trocar `<select>` nativos por `Select` do shadcn com labels ARIA, foco visível, revisar contraste de badges.
16. **SEO** das rotas públicas: `head()` com title/description únicos + OG image.
17. **Documentação interna** em `/docs/security.md`: modelo de ameaças, runbook de alerta HIGH, política de retenção, como rodar testes.

---

## Notas técnicas

- **Rate limiting (item #2 da lista original) — NÃO vou implementar**. A plataforma ainda não tem primitiva oficial de rate limit; uma solução ad-hoc (contador em tabela) tem race conditions e será substituída quando a primitiva chegar. Vou documentar isso em `/docs/security.md` como gap conhecido.
- **MFA** usa as APIs nativas do Supabase Auth — não precisa de secret novo.
- **Email de alerta** reusa o conector Google Mail já configurado, sem novos segredos.
- **Persistência de acks** vira tabela com RLS por `has_role('admin')` e grants apenas para `authenticated`.
- Cada migration nova segue o padrão GRANT obrigatório.
- Sem mexer em `src/integrations/supabase/*` (auto-gerado).

## Verificação ao fim de cada fase

- Build verde (typecheck automático).
- Playwright headless cobrindo o fluxo novo da fase.
- `supabase--linter` sem regressões.
- Resumo curto do que mudou + próximo passo.

## Estimativa

Fase 1: ~30 min · Fase 2: ~45 min · Fase 3: ~30 min · Fase 4: ~20 min. Total ~2h de execução contínua.
