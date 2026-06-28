/**
 * Export all data owned by the current user as a single JSON payload
 * (LGPD/GDPR data-portability requirement).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const USER_TABLES = [
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
  "subscriptions",
  "job_alerts",
] as const;

export type UserDataExport = {
  exported_at: string;
  user_id: string;
  tables: Record<string, unknown[]>;
};

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const out: UserDataExport = {
      exported_at: new Date().toISOString(),
      user_id: context.userId,
      tables: {},
    };

    // Each query is scoped by RLS to the caller; we still filter for safety
    // and to avoid surprises with tables that allow public reads.
    const results = await Promise.all(
      USER_TABLES.map(async (t) => {
        const { data, error } = await context.supabase
          .from(t)
          .select("*")
          .eq("owner_id", context.userId);
        if (error) {
          // owner column may differ for some tables (e.g. subscriptions uses user_id);
          // fall back gracefully so one missing column doesn't break the whole export.
          const alt = await context.supabase
            .from(t)
            .select("*")
            .eq("user_id", context.userId);
          return [t, alt.data ?? []] as const;
        }
        return [t, data ?? []] as const;
      }),
    );

    for (const [t, rows] of results) out.tables[t] = rows;

    // Audit the export request
    await context.supabase.from("security_audit_log").insert({
      event_type: "admin_action",
      user_id: context.userId,
      resource: "data_export",
      metadata: { table_count: USER_TABLES.length } as never,
    });

    return out;
  });
