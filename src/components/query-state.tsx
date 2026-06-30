/**
 * Inline query-state primitives.
 *
 * `InlineQueryError` standardizes the "load failed" UI for in-page useQuery
 * calls (when a full-screen ErrorFallback would be too aggressive). It uses
 * `friendlyMessage` / `isAppError` so users see PT-BR copy, never a raw DB
 * or JWT error — and shows an optional error code for support triage.
 */
import { AlertCircle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { friendlyMessage, isAppError } from "@/lib/errors";

interface InlineQueryErrorProps {
  error: unknown;
  /** Headline shown above the friendly message. */
  title?: string;
  /** Callback for the "Tentar novamente" button. Usually `query.refetch`. */
  onRetry?: () => void;
  /** Label for the retry button. */
  retryLabel?: string;
}

export function InlineQueryError({
  error,
  title = "Não foi possível carregar essa seção.",
  onRetry,
  retryLabel = "Tentar novamente",
}: InlineQueryErrorProps) {
  if (!error) return null;
  const message = friendlyMessage(error);
  const code = isAppError(error) ? error.code : undefined;
  return (
    <Card className="border-destructive/40 bg-destructive/5" role="alert">
      <CardContent className="pt-4 flex items-start gap-3 text-sm">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-destructive">{title}</div>
          <div className="text-xs text-muted-foreground mt-1 break-words">{message}</div>
          {code ? (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">Código: {code}</div>
          ) : null}
        </div>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-3 w-3 mr-1" /> {retryLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
