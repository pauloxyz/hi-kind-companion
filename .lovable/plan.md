# Currículo H-2A v2 + Vídeo via YouTube

Baseado no modelo enviado: PDF de 2 páginas com sidebar azul-marinho, foto de perfil circular e grid 2×3 de fotos de trabalho na página 2.

## 1. Novo gerador de PDF (`ResumePdfDocument.tsx`)

Reescrever o componente `@react-pdf/renderer` pra refletir o modelo:

**Página 1** — 2 colunas
- Sidebar esquerda (~32% largura, fundo `#1a3a6e`, texto branco):
  - Foto de perfil circular no topo (do `profile-photos` bucket)
  - Email, telefone
  - SKILLS (lista com bullets)
  - EDUCATION
  - LANGUAGE (Portuguese / English level)
- Coluna direita (fundo `#f5ede0`):
  - Nome em destaque, centralizado
  - **Profile** — summary_en
  - **Professional Experience** — até 4 cargos (título · empresa · período · descrição EN)

**Página 2** — mesma sidebar +
- Título "Records from my professional experience:"
- Grid 2×3 com até 6 fotos (cantos chanfrados via SVG clipping)

Fotos vêm assinadas via `createSignedUrl` no servidor e baixadas como bytes pro PDF embutir (não dá pra usar URL direta no react-pdf sem CORS).

## 2. Aba `/app/curriculo` — novo bloco "Fotos do currículo"

Card novo entre as seções existentes:
- Texto explicativo: "Anexe até 6 fotos suas trabalhando no campo (colhendo, operando trator, lidando com gado, etc). Empregadores americanos H-2A querem ver você em ação — isso vale mais que palavras."
- Botão "Escolher das mídias já enviadas" → modal mostra fotos do `/app/midia` (work_media) com checkbox, máx 6
- Upload direto também (vai pro mesmo bucket `work-media`, marca como `is_resume_photo=true`)
- Preview das 6 selecionadas em grid, com X pra remover e drag pra reordenar

**Schema:** adicionar coluna `is_resume_photo BOOLEAN DEFAULT false` e `resume_photo_order SMALLINT` em `work_media`. Limite de 6 fotos com flag ativa enforced no client + check no servidor.

## 3. Vídeo de apresentação → YouTube (`/app/video`)

Substitui o fluxo de gravação/upload por:

**Bloco A — Script personalizado (IA)**
- Botão "Gerar meu script de vídeo" → chama server fn que usa Lovable AI (Gemini Flash) com prompt que recebe:
  - Nome, idade, cidade, país (do `my_profile`)
  - Experiências (do `resume_experiences`) — anos, cultivos, máquinas
  - Skills
- Retorna script em **PT-BR e EN lado a lado**, ~45-60s falados, com gancho pra empregador (não genérico — cita os cultivos/máquinas reais da pessoa)
- Botões: copiar PT · copiar EN · exportar PDF (2 colunas frente a frente, fonte grande pra leitura)
- Salva o script gerado em `my_profile.video_script_pt` / `_en` pra não regerar toda vez

**Bloco B — Instruções de gravação + YouTube**
- Card "Como gravar e subir":
  1. Use o script acima (botão "Abrir script" abre o PDF)
  2. Grave horizontal, boa luz, fundo neutro, 60-90s
  3. Suba no YouTube como **"Não listado"** (passo a passo curto com print)
  4. Cole o link abaixo
- Input "Link do YouTube" com validação (regex `youtube.com/watch?v=` ou `youtu.be/`)
- Preview do embed quando colado
- Salva em `my_profile.youtube_video_url`

**Schema:** adicionar `youtube_video_url TEXT`, `video_script_pt TEXT`, `video_script_en TEXT` em `my_profile`.

A gravação webcam atual é removida (junto com o bucket de upload no flow). Tabela `intro_video` e bucket `intro-videos` ficam pra trás (não removo agora pra não quebrar dados antigos).

## 4. Email pro empregador (`buildAttachmentFooter`)

Reescrever o footer pra:

```
---
References:

Watch my 60-second introduction video (in English):
https://youtu.be/XXXXX
A short video where I introduce myself and talk about my farm experience.
```

PDF do currículo continua sendo gerado e anexado normalmente — agora ele já contém as 6 fotos dentro, então não precisa mais listar fotos como links separados. O bloco de fotos é removido do footer.

Se o perfil público estiver ativo, mantém o link `/v/{slug}` como opção complementar.

## 5. Ordem de implementação

1. Migration: novas colunas em `work_media` e `my_profile`
2. `ResumePdfDocument` reescrito (componente isolado, fácil testar)
3. Server fn `getResumePdfData` agora puxa fotos marcadas + bytes
4. UI `/app/curriculo` — bloco de fotos
5. Server fn `generateVideoScript` (Lovable AI)
6. UI `/app/video` — novo fluxo YouTube + script
7. `buildAttachmentFooter` atualizado
8. Smoke test: gerar PDF de teste, conferir layout das 2 páginas

## Detalhes técnicos

- **Cores do modelo:** sidebar `#1a3a6e`, fundo direito `#faf3e7`, texto branco na sidebar, texto `#111` na direita
- **react-pdf** não suporta `border-radius` em `Image` — foto circular fica via `View` com `borderRadius: 9999` e overflow hidden contendo o `Image`
- **Fotos chanfradas** da página 2: usar `View` com `clipPath` não funciona em react-pdf; vou usar uma máscara SVG via `Svg`+`ClipPath`+`Image` (suportado pelo `@react-pdf/renderer`)
- **YouTube validation:** regex aceita `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`, normaliza pra `https://youtu.be/ID`
- **AI script prompt:** instrui Gemini a NÃO usar jargão, mencionar 1 cultivo/animal/máquina específico da experiência, terminar com "I can start on [date] and I'm ready to work hard" — sem clichês
- **PDF export do script** usa o mesmo `react-pdf` (já temos a infra), layout 2 colunas A4
