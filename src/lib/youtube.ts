/**
 * Helpers para tratar URLs de vídeos do YouTube de forma consistente
 * — usado tanto para validar no formulário do perfil quanto para montar
 * o embed em `/v/:slug`.
 *
 * Sobre privacidade: o YouTube não expõe o status de visibilidade
 * (público / não listado / privado) na URL. Vídeos privados nem
 * carregam no embed (o iframe renderiza "Video unavailable"). "Não
 * listado" e "público" são indistinguíveis sem chamada à Data API,
 * que exige API key — fora do escopo desse fluxo. Por isso a UI
 * orienta o usuário a marcar como "Não listado" e a validação aqui
 * trata só o que dá pra inferir da URL.
 */

const YT_ID_RE = /^[\w-]{6,15}$/;

/**
 * Extrai o video ID de qualquer forma comum de URL do YouTube:
 * - https://youtu.be/{id}
 * - https://www.youtube.com/watch?v={id}
 * - https://www.youtube.com/shorts/{id}
 * - https://www.youtube.com/embed/{id}
 * - https://www.youtube.com/v/{id}
 * - https://www.youtube-nocookie.com/embed/{id}
 *
 * Retorna `null` para qualquer entrada que não case com esses padrões —
 * o caller decide como reagir (mostrar erro, esconder embed, etc).
 */
export function parseYouTubeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Aceita ID puro (útil para testes e para colar só o ID)
  if (YT_ID_RE.test(trimmed) && !trimmed.includes("/")) return trimmed;

  let u: URL;
  try {
    // Tolera URL sem protocolo (ex.: "youtu.be/abc")
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    u = new URL(withProto);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return YT_ID_RE.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v && YT_ID_RE.test(v)) return v;
    const m = u.pathname.match(/\/(?:embed|shorts|v|live)\/([\w-]{6,15})/);
    if (m && YT_ID_RE.test(m[1])) return m[1];
  }

  return null;
}

/**
 * Normaliza a URL em uma forma canônica `https://youtu.be/{id}`.
 * Retorna `null` quando a entrada não contém um ID válido — o caller
 * deve bloquear o save / mostrar erro nesse caso.
 *
 * Por que `youtu.be`: forma mais curta, sobrevive a redirects do YouTube,
 * e é o que o YouTube gera no botão "Compartilhar" por padrão.
 */
export function normalizeYouTubeUrl(raw: string | null | undefined): string | null {
  const id = parseYouTubeId(raw);
  return id ? `https://youtu.be/${id}` : null;
}
