import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

// Minimum score to be accepted on signup / password reset.
// 0 Muito fraca · 1 Fraca · 2 Razoável · 3 Forte · 4 Excelente
export const MIN_ACCEPTABLE_SCORE: PasswordScore = 2;

type Lang = "pt" | "en" | "es";

const L = {
  pt: {
    labels: ["Muito fraca", "Fraca", "Razoável", "Forte", "Excelente"],
    strength: "Força",
    chars: (n: number) => `${n} caracteres`,
    blocked: "Senha muito fraca — escolha uma mais forte para continuar.",
    hints: {
      length: "Use ao menos 8 caracteres.",
      common: "Senha muito comum — escolha outra.",
      upperLower: "Misture letras maiúsculas e minúsculas.",
      number: "Adicione números.",
      symbol: "Adicione um símbolo (!@#$…) para ficar excelente.",
      ok: "Senha sólida.",
    },
  },
  en: {
    labels: ["Very weak", "Weak", "Fair", "Strong", "Excellent"],
    strength: "Strength",
    chars: (n: number) => `${n} characters`,
    blocked: "Password too weak — choose a stronger one to continue.",
    hints: {
      length: "Use at least 8 characters.",
      common: "Password too common — pick another.",
      upperLower: "Mix uppercase and lowercase letters.",
      number: "Add numbers.",
      symbol: "Add a symbol (!@#$…) to make it excellent.",
      ok: "Solid password.",
    },
  },
  es: {
    labels: ["Muy débil", "Débil", "Aceptable", "Fuerte", "Excelente"],
    strength: "Fuerza",
    chars: (n: number) => `${n} caracteres`,
    blocked: "Contraseña muy débil — elige una más fuerte para continuar.",
    hints: {
      length: "Usa al menos 8 caracteres.",
      common: "Contraseña muy común — elige otra.",
      upperLower: "Mezcla mayúsculas y minúsculas.",
      number: "Añade números.",
      symbol: "Añade un símbolo (!@#$…) para que sea excelente.",
      ok: "Contraseña sólida.",
    },
  },
} satisfies Record<Lang, unknown>;

const COMMON = new Set([
  "12345678", "123456789", "password", "password1", "senha123",
  "qwerty123", "abc12345", "111111111", "000000000", "iloveyou",
  "admin123", "12345678a", "senha1234", "brasil123",
]);

export function scorePassword(pw: string): {
  score: PasswordScore;
  checks: { length: boolean; upperLower: boolean; number: boolean; symbol: boolean; long: boolean; notCommon: boolean };
} {
  const length = pw.length >= 8;
  const long = pw.length >= 12;
  const upperLower = /[a-z]/.test(pw) && /[A-Z]/.test(pw);
  const number = /\d/.test(pw);
  const symbol = /[^A-Za-z0-9]/.test(pw);
  const notCommon = pw.length > 0 && !COMMON.has(pw.toLowerCase());

  let raw = 0;
  if (length) raw++;
  if (upperLower) raw++;
  if (number) raw++;
  if (symbol) raw++;
  if (long) raw++;
  if (!notCommon) raw = Math.min(raw, 1);
  if (!length) raw = Math.min(raw, 1);

  const score = (Math.max(0, Math.min(4, raw - 1)) as PasswordScore);
  return { score, checks: { length, upperLower, number, symbol, long, notCommon } };
}

export function isPasswordAcceptable(pw: string): boolean {
  return scorePassword(pw).score >= MIN_ACCEPTABLE_SCORE;
}

const BAR_BG: Record<PasswordScore, string> = {
  0: "bg-destructive",
  1: "bg-destructive",
  2: "bg-accent-gold",
  3: "bg-primary",
  4: "bg-primary",
};
const TEXT_COLOR: Record<PasswordScore, string> = {
  0: "text-destructive",
  1: "text-destructive",
  2: "text-accent-gold",
  3: "text-primary",
  4: "text-primary",
};

export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const { lang } = useI18n();
  const tr = L[(["pt", "en", "es"].includes(lang) ? lang : "pt") as Lang];
  const { score, checks } = useMemo(() => scorePassword(password), [password]);

  if (password.length === 0) return null;

  const filled = score + 1;
  const label = tr.labels[score];

  const hint = !checks.length
    ? tr.hints.length
    : !checks.notCommon
      ? tr.hints.common
      : !checks.upperLower
        ? tr.hints.upperLower
        : !checks.number
          ? tr.hints.number
          : !checks.symbol
            ? tr.hints.symbol
            : tr.hints.ok;

  const blocked = score < MIN_ACCEPTABLE_SCORE;

  return (
    <div id={id} className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < filled ? BAR_BG[score] : "bg-border",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={cn("font-semibold", TEXT_COLOR[score])}>
          {tr.strength}: {label}
        </span>
        <span className="text-muted-foreground">{tr.chars(password.length)}</span>
      </div>
      <p className={cn("text-[11px]", blocked ? "text-destructive font-medium" : "text-muted-foreground")}>
        {blocked ? tr.blocked : hint}
      </p>
    </div>
  );
}
