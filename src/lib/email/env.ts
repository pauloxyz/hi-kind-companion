/**
 * Client-side helper to tell whether the admin is operating on the
 * production deployment or a preview/sandbox build. Used to drive the
 * default execution mode (dry-run vs real send) on the admin pages.
 *
 * "Production" = visiting the app on the verified custom domain.
 */
export type EmailEnv = "production" | "preview" | "local";

export function detectEmailEnv(): EmailEnv {
  if (typeof window === "undefined") return "preview";
  const host = window.location.hostname;
  if (host === "vplusa.com" || host === "www.vplusa.com") return "production";
  if (host === "localhost" || host === "127.0.0.1") return "local";
  return "preview";
}

export const envLabel: Record<EmailEnv, string> = {
  production: "Produção",
  preview: "Preview / sandbox",
  local: "Local",
};

export const envBadgeClass: Record<EmailEnv, string> = {
  production: "bg-destructive text-destructive-foreground",
  preview: "bg-amber-500 text-white",
  local: "bg-slate-500 text-white",
};
