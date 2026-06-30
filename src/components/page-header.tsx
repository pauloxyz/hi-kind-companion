import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Padrão de cabeçalho de página: título display + subtítulo + ações opcionais.
 *
 * - Layout responsivo: em mobile usa grid `[minmax(0,1fr)_auto]` para o título
 *   poder truncar/quebrar sem empurrar as ações. Em sm+ vira flex wrap.
 * - Tipografia: `font-display` com escala fluida (3xl → 4xl → ~42px).
 * - Acessibilidade: usa `<header>` semântico, `text-balance` no h1, leading
 *   confortável no subtítulo.
 */
export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Ícone opcional renderizado antes do título (ex.: <Shield className="size-7" />). */
  icon?: ReactNode;
  /** Ações alinhadas à direita (botões, badges). */
  actions?: ReactNode;
  /** Eyebrow/kicker acima do título (ex.: "Fase atual"). */
  eyebrow?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) {
  const hasActions = Boolean(actions);
  return (
    <header
      className={cn(
        hasActions
          ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
          : "space-y-1.5",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          {icon ? (
            <span className="shrink-0 text-primary" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.625rem] font-bold leading-[1.05] tracking-tight text-balance">
            {title}
          </h1>
        </div>
        {description ? (
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-3xl">
            {description}
          </p>
        ) : null}
      </div>
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </header>
  );
}
