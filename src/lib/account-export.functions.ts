/**
 * Export all data owned by the current user as a single JSON payload
 * (LGPD/GDPR data-portability requirement).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = Record<string, string | number | boolean | null>;

const OWNER_ID_TABLES = [
  "my_profile",
  "resumes",
  "resume_experiences",
  "resume_skills",
  "applications",
  "saved_jobs",
  "visa_checklist_items",
  "work_media",
  "intro_video",
  "english_progress",
  "english_flashcard_reviews",
  "job_alerts",
] as const;

const USER_ID_TABLES = ["subscriptions"] as const;

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tables: Record<string, Row[]> = {};

    const client = context.supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => Promise<{ data: Row[] | null; error: unknown }>;
        };
      };
    };

    for (const t of OWNER_ID_TABLES) {
      const { data } = await client.from(t).select("*").eq("owner_id", context.userId);
      tables[t] = data ?? [];
    }
    for (const t of USER_ID_TABLES) {
      const { data } = await client.from(t).select("*").eq("user_id", context.userId);
      tables[t] = data ?? [];
    }

    await client
      .from("security_audit_log")
      .select("id")
      .eq("id", "noop")
      .catch(() => {});

    // Audit the export request via the typed client
    await context.supabase.from("security_audit_log").insert({
      event_type: "admin_action",
      user_id: context.userId,
      resource: "data_export",
      metadata: { table_count: OWNER_ID_TABLES.length + USER_ID_TABLES.length } as never,
    });

    return {
      exported_at: new Date().toISOString(),
      user_id: context.userId,
      tables,
    };
  });
