import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

const LEVELS: { label: string; color: string; bg: string; hint: string }[] = [
  { label: "Muito fraca", color: "text-destructive", bg: "bg-destructive", hint: "Use ao menos 8 caracteres." },
  { label: "Fraca", color: "text-destructive", bg: "bg-destructive", hint: "Misture letras maiúsculas e minúsculas." },
  { label: "Razoável", color: "text-accent-gold", bg: "bg-accent-gold", hint: "Adicione números." },
  { label: "Forte", color: "text-primary", bg: "bg-primary", hint: "Adicione um símbolo para ficar excelente." },
  { label: "Excelente", color: "text-primary", bg: "bg-primary", hint: "Senha sólida." },
];

const COMMON = new Set([
  "12345678", "123456789", "password", "senha123", "qwerty123",
  "abc12345", "111111111", "000000000", "iloveyou", "admin123",
]);

export function scorePassword(pw: string): { score: PasswordScore; checks: { length: boolean; upperLower: boolean; number: boolean; symbol: boolean; long: boolean; notCommon: boolean } } {
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

export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const { score, checks } = useMemo(() => scorePassword(password), [password]);
  const level = LEVELS[score];
  const filled = password.length === 0 ? 0 : score + 1;

  if (password.length === 0) return null;

  const hint = !checks.length
    ? "Use ao menos 8 caracteres."
    : !checks.notCommon
      ? "Senha muito comum — escolha outra."
      : !checks.upperLower
        ? "Misture letras maiúsculas e minúsculas."
        : !checks.number
          ? "Adicione números."
          : !checks.symbol
            ? "Adicione um símbolo (!@#$…) para ficar excelente."
            : level.hint;

  return (
    <div id={id} className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < filled ? level.bg : "bg-border",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={cn("font-semibold", level.color)}>
          Força: {level.label}
        </span>
        <span className="text-muted-foreground">{password.length} caracteres</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
