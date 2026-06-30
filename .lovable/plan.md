# Plano: Onboarding renovado (perfil-first, < 90s)

Objetivo: reduzir fricção entre "clicou em criar perfil" e "enviou perfil pra
recrutador" para menos de 2 minutos. Velocidade > perfeição.

## Princípios

1. **Velocidade > perfeição**. Cada tela tem 1 decisão. Nada de formulário longo.
2. **Vídeo é o coração**. Quem grava vídeo = lead qualificado. Treat it as the
   north-star metric do funil.
3. **WhatsApp é o canal**. O envio final abre `wa.me/?text=...` com mensagem pronta
   + link `/v/:slug`. Não construir inbox interno.
4. **Confiança visível**. Cada tela reforça "grátis, sem taxa, sem agenciador".

## Fluxo (telas)

```
Landing → /auth (Google/email)
       ↓
/app/onboarding/welcome      (tela 1: posicionamento — 1 botão)
       ↓
/app/onboarding/explica      (tela 2: o que vai acontecer — 1 botão)
       ↓
/app/onboarding/dados        (tela 3.1: nome, idade, cidade/estado, WhatsApp)
       ↓
/app/onboarding/experiencia  (tela 3.2: checklist plantio/colheita/máquinas/irrigação/outros)
       ↓
/app/onboarding/fisico       (tela 3.3: checklist peso/calor-frio/longas jornadas)
       ↓
/app/onboarding/video        (tela 3.4: gravação 60s — script visível, botão único)
       ↓
/app/onboarding/pronto       (tela 4: "perfil pronto ✅" — link + 2 CTAs)
       ↓
[Envio] wa.me deep-link OU copiar link `/v/:slug`
       ↓
/app/perfil (estado pós-envio: dicas, "melhorar perfil", "gravar novo vídeo")
```

## Tarefas técnicas

### 1. Rotas e shell
- Criar layout `src/routes/_authenticated/app.onboarding.tsx` (Outlet + progress
  bar 1/6, sticky bottom CTA, skip discreto).
- Criar 7 rotas filhas: `welcome`, `explica`, `dados`, `experiencia`, `fisico`,
  `video`, `pronto`.
- Cada rota: 1 pergunta, 1 botão primário ("Continuar"), 1 secundário ("Pular").
- Auto-redirect: se `profile.onboarding_completed_at` existir, manda pra `/app/perfil`.

### 2. Schema (migration)
Adicionar em `profiles` (se não existirem):
- `onboarding_step` (smallint default 0)
- `onboarding_completed_at` (timestamptz)
- `field_experience` (text[] — plantio/colheita/maquinas/irrigacao/outros)
- `physical_ok` (jsonb — { lift: bool, weather: bool, long_hours: bool })

RLS já cobre `profiles`. Adicionar GRANT só se coluna nova precisar.

### 3. Componentes reutilizáveis
- `OnboardingShell` (progress bar, header, footer sticky).
- `CheckboxGrid` (cards selecionáveis grandes, mobile-first).
- `VideoRecorder` (já existe? Se sim, reaproveitar; se não, MediaRecorder
  API + upload Supabase Storage bucket `intro-videos`, max 60s, mp4/webm).

### 4. Servidor (server functions)
- `saveOnboardingStep({ step, payload })` em `src/lib/onboarding.functions.ts`
  com `requireSupabaseAuth` — valida com Zod, faz upsert parcial em `profiles`.
- `completeOnboarding()` — seta `onboarding_completed_at`, dispara
  `public_page_enabled = true`, gera `public_slug` se vazio.

### 5. Envio (tela "pronto")
- Botão `[Enviar via WhatsApp]` abre:
  ```
  https://wa.me/?text=Olá%2C%20sou%20trabalhador%20agrícola%20brasileiro%20
  com%20interesse%20em%20vagas%20H-2A.%20Segue%20meu%20perfil%3A%20{link}
  ```
- Botão `[Copiar link]` copia `https://vplusa.com/v/{slug}` com toast.
- Bônus: lista 3 contatos sugeridos (recruiters do `recruiters` table — se
  existir tabela; senão, fica pra v2).

### 6. Retenção (pós-envio)
- Em `/app/perfil`, banner condicional se `onboarding_completed_at` < 24h:
  "Agora aguarde o contato. Enquanto isso: [melhorar perfil] [gravar novo
  vídeo] [ver dicas H-2A]".
- Email/notificação D+3 se sem update: "Perfis com vídeo têm 3x mais chances"
  (usar fluxo de email existente).

## Métricas a instrumentar

- Taxa de conclusão por tela (drop-off por step).
- Tempo total welcome → pronto (alvo: P50 < 90s).
- % usuários que gravam vídeo.
- % que clicam "Enviar via WhatsApp" vs "Copiar link".

## Estimativa

- Schema + rotas + shell: 1h
- Telas 1-3 (estáticas + form simples): 1h
- VideoRecorder + upload: 1h30 (se não existir)
- Tela pronto + integração wa.me: 30min
- Pós-envio (banner + dicas): 30min
- QA mobile (iOS Safari + Android Chrome): 30min
- **Total: ~5h**

## Não-escopo (v2)

- WhatsApp OTP como login (precisa Twilio/MessageBird, custo recorrente).
- Inbox interno de mensagens com recrutador.
- Match algorítmico perfil ↔ vaga.
- Notificações push.

---

# Onda 2 — Plano Free vs Pro (a implementar por feature)

Decidido com o usuário: além do **Curso de inglês H-2A completo**, as features
abaixo são exclusivas do plano Pro. Cada uma vira uma rodada própria, com
schema + server fn + UI + gating por `public.is_pro(auth.uid())`.

## Feature flag pattern

Toda feature Pro deve passar por um único helper client:

```ts
// src/lib/is-pro.ts
export function useIsPro(): { isPro: boolean; loading: boolean }
```

e por gate server-side dentro da própria server fn (nunca confiar só no client).

## Roadmap Pro

1. **Múltiplos currículos/perfis** — tabela `profile_variants` (id, owner_id,
   label, role_focus, field_experience[], physical[], summary). UI: seletor no
   `/app/perfil` e no envio do WhatsApp ("Qual currículo enviar?").
2. **Tradução automática PT→EN** do currículo e da mensagem do WhatsApp.
   Server fn `translateResume`/`translateMessage` via Lovable AI (já temos
   gateway). Free vê preview com 1 frase traduzida + CTA "Liberar tradução
   completa no Pro".
3. **Histórico de candidaturas** — visualizações, status (enviado, visto,
   respondido). Extender `applications` + nova `application_views`. Painel em
   `/app/candidaturas` com timeline.
4. **Perfil em destaque + selo Verificado PRO** — coluna `featured_until`,
   ordenação no /v listing dos recrutadores, badge no `/v/:slug`.
5. **Notificação prioritária** — novo dispatch que entrega para Pro X minutos
   antes do free quando uma vaga compatível é importada.
6. **Simulado de entrevista** — `/app/ingles/entrevista`: IA simula recrutador
   em inglês, dá feedback de pronúncia/conteúdo via Lovable AI.
7. **Checklist de visto interativo** (parte avançada) — prazos, lembretes por
   e-mail; o checklist base já existe, expandimos com cronograma e alertas.
8. **Verificação de recrutador/produtor** — fluxo de submissão de docs +
   selo "Empresa verificada" no `/v/empresas/:id`.
9. **Suporte prioritário** — fila separada no /app/configuracoes/suporte;
   apenas Pro vê o canal WhatsApp/chat direto.
10. **Estatísticas do perfil** — `profile_views` já existe; surface em
    `/app/perfil` apenas para Pro (quantas views, de qual estado americano,
    taxa de resposta).

## Já no Free

- Onboarding completo (6 telas).
- Perfil público `/v/:slug` enviável por WhatsApp.
- Vagas + filtros básicos, candidatura simples.
- Módulo 1 do curso de inglês.
- 1 currículo.

---

# Onda 1 — Entregue nesta rodada

- Tabela `public.onboarding_events` (RLS por user, leitura admin).
- Trigger `validate_my_profile_input` no servidor: idade 16–80, UF /^[A-Z]{2}$/,
  WhatsApp 10–15 dígitos. Normaliza UF e telefone.
- Server fn `logOnboardingEvent` espelhando cada `track()` do client.
- Server fn `getOnboardingFunnel` (admin) agregando eventos + snapshot
  `my_profile.onboarding_step`.
- Painel admin `/admin/onboarding` com KPIs, funil por etapa, distribuição
  atual e eventos recentes.
- Sidebar trava itens com `requiresOnboarding` enquanto onboarding incompleto;
  Perfil e Configurações ficam sempre acessíveis (precisa terminar o cadastro).
- E2E spec `e2e/onboarding.spec.ts` cobrindo validação, geração do link do
  WhatsApp e tela de confirmação.
