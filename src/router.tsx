import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ErrorFallback, NotFoundFallback } from "./components/error-fallback";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Friendlier defaults for transient failures: 1 retry on network/5xx,
        // backoff capped at 4s so users don't stare at a spinner forever.
        // Mutations stay at 0 retries — they may be non-idempotent.
        retry: (failureCount, error: unknown) => {
          if (failureCount >= 1) return false;
          const status = (error as { status?: number } | null)?.status;
          if (typeof status === "number" && status < 500 && status !== 408 && status !== 429) {
            return false;
          }
          return true;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Belt-and-braces fallbacks: any route without its own error/notFound
    // component falls through to these branded screens instead of the raw
    // TanStack defaults. The root route still has its own copies for the
    // catastrophic-SSR case (see __root.tsx).
    defaultErrorComponent: ErrorFallback,
    defaultNotFoundComponent: NotFoundFallback,
  });

  return router;
};
