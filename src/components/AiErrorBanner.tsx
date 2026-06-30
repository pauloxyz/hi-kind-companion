import { memo } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";

export type AiErrorInfo = {
  /** Logical action that failed — used by parent to route retry. */
  action: "script" | "meta";
  code: "rate_limited" | "no_credits" | "bad_json" | "other";
  msg: string;
  /** Epoch ms when retry becomes allowed again; 0 = retry immediately. */
  retryAt: number;
};

export type AiErrorBannerProps = {
  error: AiErrorInfo | null;
  /** Whole seconds left until retry is unlocked. 0 once the countdown ends. */
  secondsLeft: number;
  onRetry: () => void;
  onDismiss: () => void;
  /** True while the parent is re-running the action. */
  busy: boolean;
};

function bannerTitle(code: AiErrorInfo["code"]): string {
  if (code === "no_credits") return "Créditos de IA esgotados";
  if (code === "rate_limited") return "Limite temporário atingido";
  if (code === "bad_json") return "Resposta inesperada da IA";
  return "Falha na geração";
}

export const AiErrorBanner = memo(function AiErrorBanner({
  error,
  secondsLeft,
  onRetry,
  onDismiss,
  busy,
}: AiErrorBannerProps) {
  if (!error) return null;
  const blocked = error.code === "no_credits";
  const waiting = error.code === "rate_limited" && secondsLeft > 0;
  const readyAfterWait = error.code === "rate_limited" && secondsLeft === 0;
  const palette = blocked
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200";

  return (
    <div
      role="alert"
      aria-live={blocked ? "assertive" : "polite"}
      data-testid="ai-error-banner"
      data-code={error.code}
      data-action={error.action}
      className={`flex items-start gap-2 text-xs rounded-md border p-3 ${palette}`}
    >
      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div>
          <div className="font-semibold">{bannerTitle(error.code)}</div>
          <div data-testid="ai-error-msg">{error.msg}</div>
          <div className="text-[11px] opacity-80 mt-1">
            Nada do que você já fez foi perdido — o roteiro, áudios e link continuam salvos.
          </div>
          {readyAfterWait && (
            <div
              data-testid="ai-error-ready"
              className="text-[11px] font-semibold mt-1 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3 w-3" /> Pronto — pode tentar de novo
            </div>
          )}
        </div>
        {!blocked && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={busy || waiting}
              aria-disabled={busy || waiting}
              data-testid="ai-error-retry"
              data-waiting={waiting ? "1" : "0"}
              className="h-7"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
              )}
              {waiting ? `Aguarde ${secondsLeft}s para tentar de novo` : "Tentar de novo"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={onDismiss}
              data-testid="ai-error-dismiss"
            >
              Dispensar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});
