/**
 * Maps Supabase Auth / OAuth errors to friendly PT-BR titles + descriptions.
 *
 * Keeps auth UX consistent across sign-in, sign-up and reset flows: the
 * same underlying error (e.g. `invalid_credentials`) always renders the
 * same title and copy no matter which form triggered it.
 *
 * Falls back to the shared AppError kind-map (`toAppError`) for anything
 * that isn't a well-known auth code — this preserves the project-wide
 * PT-BR error convention (never leak raw DB/JWT/stack messages).
 */
import { toAppError } from "./errors";

export type AuthUiError = {
  /** Short bold headline shown in toast + inline alert. */
  title: string;
  /** Longer explanation / next step for the user. */
  description: string;
  /**
   * Bucket used for security audit logging. Not shown to users.
   *   - "credentials" → wrong email/password
   *   - "hibp"        → leaked password rejected
   *   - "rate_limit"  → too many attempts / email sends
   *   - "network"     → offline / fetch failure
   *   - "other"       → everything else (server, validation, unknown)
   */
  bucket: "credentials" | "hibp" | "rate_limit" | "network" | "other";
};

/**
 * Well-known Supabase auth error codes / message patterns.
 * Kept as an ordered list so more-specific patterns match before
 * generic ones (e.g. "weak_password" before "password").
 */
const AUTH_ERROR_MAP: Array<{ match: RegExp; ui: AuthUiError }> = [
  {
    match: /invalid.?login|invalid.?credentials|invalid.?grant/i,
    ui: {
      title: "E-mail ou senha incorretos",
      description: "Confira seus dados e tente novamente. Se esqueceu a senha, use o link abaixo do formulário.",
      bucket: "credentials",
    },
  },
  {
    match: /email.?not.?confirmed|not.?confirmed/i,
    ui: {
      title: "Confirme seu e-mail",
      description: "Enviamos um link de confirmação quando você se cadastrou. Verifique sua caixa de entrada e o spam.",
      bucket: "other",
    },
  },
  {
    match: /user.?already.?(registered|exists)|already.?registered/i,
    ui: {
      title: "Este e-mail já tem conta",
      description: "Volte ao login ou use \"Esqueci minha senha\" para recuperar o acesso.",
      bucket: "other",
    },
  },
  {
    match: /weak.?password|password.*(weak|short|length)|pwned|leaked|known.*easy.*guess/i,
    ui: {
      title: "Senha muito fraca ou já vazada",
      description: "Escolha uma senha com 8+ caracteres, misturando letras, números e símbolos. Evite senhas já usadas em outros sites.",
      bucket: "hibp",
    },
  },
  {
    match: /over.?email.?send.?rate.?limit|too.?many.?requests|rate.?limit/i,
    ui: {
      title: "Muitas tentativas em pouco tempo",
      description: "Aguarde alguns minutos antes de tentar de novo. Isso protege sua conta contra bots.",
      bucket: "rate_limit",
    },
  },
  {
    match: /captcha/i,
    ui: {
      title: "Verificação falhou",
      description: "Recarregue a página e tente novamente. Se persistir, desative extensões de bloqueio.",
      bucket: "other",
    },
  },
  {
    match: /popup|oauth.*(cancel|closed)|user.*cancel/i,
    ui: {
      title: "Login com Google cancelado",
      description: "A janela do Google foi fechada antes de concluir. Tente de novo.",
      bucket: "other",
    },
  },
  {
    match: /unsupported.?provider/i,
    ui: {
      title: "Login social indisponível",
      description: "Este provedor ainda não está configurado. Entre com e-mail e senha.",
      bucket: "other",
    },
  },
  {
    match: /network|failed to fetch|offline/i,
    ui: {
      title: "Sem conexão",
      description: "Verifique sua internet e tente novamente.",
      bucket: "network",
    },
  },
];

/**
 * Belt-and-suspenders leak filter. Even if `pickReadableMessage` in
 * errors.ts lets a message through, we refuse to surface anything that
 * mentions infra internals to the auth UI. Keep in sync with the
 * LEAK_PATTERNS list in auth-errors.test.ts.
 */
const LEAK_RE = /postgrest|sqlstate|\bjwt\b|\bjws\b|bearer|permission denied|relation .* (does not|doesn't) exist|duplicate key|pgrst\d+|supabase\.co|at\s+\w+\s+\(/i;

const GENERIC_FALLBACK: AuthUiError = {
  title: "Não foi possível continuar",
  description: "Tente novamente em instantes. Se o problema persistir, atualize a página.",
  bucket: "other",
};

/**
 * Normalizes any thrown value into an AuthUiError. Never returns raw
 * Supabase/PostgREST wire text — unknown errors fall back to the shared
 * AppError kind translation, and any residual leaked substring is
 * scrubbed by the LEAK_RE gate below.
 */
export function toAuthUiError(err: unknown): AuthUiError {
  const raw =
    err instanceof Error ? err.message :
    typeof err === "string" ? err :
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) :
    "";

  for (const { match, ui } of AUTH_ERROR_MAP) {
    if (match.test(raw)) return ui;
  }

  const app = toAppError(err);
  const bucket: AuthUiError["bucket"] =
    app.kind === "network" ? "network" :
    app.kind === "rate_limited" ? "rate_limit" :
    "other";

  // If the derived description still contains any leak substring, drop
  // it in favour of the generic PT-BR copy. Preserves the bucket so
  // downstream telemetry keeps the correct classification.
  if (LEAK_RE.test(app.message)) {
    return { ...GENERIC_FALLBACK, bucket };
  }

  return {
    title: "Não foi possível continuar",
    description: app.message,
    bucket,
  };
}
