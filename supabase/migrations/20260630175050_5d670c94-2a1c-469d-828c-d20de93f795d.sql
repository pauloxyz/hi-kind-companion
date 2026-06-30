-- Performance indexes (Phase 1) — no schema/data changes
CREATE INDEX IF NOT EXISTS idx_jobs_imported_at
  ON public.jobs (imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_posted_date
  ON public.jobs (posted_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_apps_owner_sent
  ON public.applications (owner_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_apps_owner_responded
  ON public.applications (owner_id, responded_at)
  WHERE responded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_apps_owner_followup
  ON public.applications (owner_id, follow_up_due_at)
  WHERE responded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_apps_thread
  ON public.applications (owner_id, gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_jobs_owner
  ON public.saved_jobs (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visa_items_owner_sort
  ON public.visa_checklist_items (owner_id, sort_order);
