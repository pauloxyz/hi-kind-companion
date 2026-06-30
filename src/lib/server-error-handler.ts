/**
 * Wrapper around `createServerFn().handler(...)` that normalizes any thrown
 * error into an AppError and logs it server-side with structured context.
 *
 * Why a wrapper instead of every handler doing its own try/catch:
 *   - Guarantees the client never sees a raw PostgrestError / stack trace.
 *   - Single place to add observability (structured server logs, future
 *     Sentry breadcrumb, latency metric, …).
 *   - TanStack Start surfaces a thrown AppError to the client via its RPC
 *     serialization: `err.message`, `err.name === 'AppError'`, and the
 *     custom fields are visible on the client side — so `toastError(err)`
 *     in a `useServerFn` call-site shows the friendly PT-BR message.
 *
 * Usage:
 *
 *   import { createServerFn } from "@tanstack/react-start";
 *   import { withServerErrors } from "@/lib/server-error-handler";
 *
 *   export const saveThing = createServerFn({ method: "POST" })
 *     .inputValidator((d: { id: string }) => d)
 *     .handler(withServerErrors("thing.save", async ({ data }) => {
 *       // …; throw new AppError("Esse item já existe.", { kind: "conflict" });
 *     }));
 */
import { AppError, toAppError } from "./errors";

type Handler<TIn, TOut> = (input: TIn) => Promise<TOut> | TOut;

export function withServerErrors<TIn, TOut>(
  /** Stable operation name for log correlation, e.g. "applications.create". */
  operation: string,
  handler: Handler<TIn, TOut>,
): Handler<TIn, TOut> {
  return async (input: TIn) => {
    try {
      return await handler(input);
    } catch (err) {
      const appErr = toAppError(err);
      // Server-side log: kind+code for grouping, full cause for the stack.
      // `console.error(error)` (not `.message`) preserves `.stack` for the
      // Cloudflare Workers log pipeline; see tanstack-ssr-error-handling.
      console.error(
        `[server-fn] ${operation} failed: kind=${appErr.kind} code=${appErr.code ?? "-"} status=${appErr.status ?? "-"}`,
        appErr.cause ?? appErr,
      );
      // Re-throw so TanStack Start serializes the friendly message to the
      // client. We rethrow as AppError so `instanceof AppError` works on
      // the calling component side too.
      if (appErr === err) throw err;
      throw new AppError(appErr.message, {
        kind: appErr.kind,
        code: appErr.code,
        status: appErr.status,
        context: appErr.context,
        cause: appErr.cause,
      });
    }
  };
}
