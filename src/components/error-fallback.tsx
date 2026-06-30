/**
 * Reusable error/notFound fallbacks used by the router defaults and by any
 * route that wants the standard look-and-feel without duplicating JSX.
 *
 * Kept dependency-light on purpose: just `@tanstack/react-router` + Tailwind
 * classes, no shadcn primitives — so it can render even when other parts of
 * the app fail to hydrate.
 */
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { friendlyMessage, isAppError } from "@/lib/errors";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
  /** Boundary tag for telemetry (e.g. "router_default", "route:/posts"). */
  boundary?: string;
}

export function ErrorFallback({ error, reset, boundary = "default" }: ErrorFallbackProps) {
  const router = useRouter();
  const message = friendlyMessage(error);
  const code = isAppError(error) ? error.code : undefined;

  useEffect(() => {
    console.error(`[error-boundary:${boundary}]`, error);
    reportLovableError(error, { boundary });
  }, [error, boundary]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível carregar essa página
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {code ? (
          <p className="mt-1 text-xs text-muted-foreground/70">Código: {code}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

export function NotFoundFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O conteúdo que você procura não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
