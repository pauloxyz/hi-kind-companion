/**
 * Toast helpers that surface AppError-friendly messages in PT-BR.
 *
 * Usage:
 *   import { toastError, toastSuccess, withErrorToast } from "@/lib/toast-error";
 *
 *   try {
 *     await saveProfile(data);
 *     toastSuccess("Perfil atualizado");
 *   } catch (err) {
 *     toastError(err, { action: { label: "Tentar de novo", onClick: retry } });
 *   }
 *
 *   // Or wrap an async fn so callers don't need a try/catch:
 *   const onSubmit = withErrorToast(async () => { await saveProfile(data) });
 */
import { toast } from "sonner";

import { toAppError, type AppError } from "./errors";

interface ToastErrorOptions {
  /** Override the message shown to the user (otherwise derived from the error). */
  title?: string;
  /** Optional description shown below the title. */
  description?: string;
  /** Optional action button (e.g. "Tentar novamente"). */
  action?: { label: string; onClick: () => void };
  /** Suppress console.error (defaults to false — we log so triage has the stack). */
  silent?: boolean;
}

const KIND_TITLE: Record<AppError["kind"], string> = {
  validation:   "Revise os campos",
  unauthorized: "Entre na sua conta",
  forbidden:    "Acesso negado",
  not_found:    "Não encontrado",
  conflict:     "Conflito de dados",
  rate_limited: "Aguarde um momento",
  upstream:     "Serviço instável",
  network:      "Sem conexão",
  internal:     "Algo deu errado",
};

export function toastError(err: unknown, options: ToastErrorOptions = {}) {
  const appErr = toAppError(err);
  if (!options.silent) {
    // Keep the raw error in the console so devs see the full stack.
    console.error("[toastError]", appErr.code ?? appErr.kind, appErr.cause ?? appErr);
  }
  toast.error(options.title ?? KIND_TITLE[appErr.kind], {
    description: options.description ?? appErr.message,
    action: options.action,
  });
  return appErr;
}

export function toastSuccess(title: string, description?: string) {
  toast.success(title, description ? { description } : undefined);
}

export function toastInfo(title: string, description?: string) {
  toast(title, description ? { description } : undefined);
}

/**
 * Wrap an async function so any thrown error is converted into a toast and
 * the wrapped function never rejects (returns `undefined` on failure).
 * Handy for event handlers where an unhandled rejection would silently die.
 */
export function withErrorToast<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: ToastErrorOptions = {},
): (...args: TArgs) => Promise<TResult | undefined> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (err) {
      toastError(err, options);
      return undefined;
    }
  };
}
