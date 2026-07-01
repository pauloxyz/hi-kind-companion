
-- ============================================================
-- 1) Fix mutable search_path on SECURITY DEFINER functions
-- ============================================================
ALTER FUNCTION public.delete_email(text, bigint)              SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb)              SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)  SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

-- ============================================================
-- 2) Revoke EXECUTE on SECURITY DEFINER functions that must NOT
--    be reachable from the Data API (PostgREST) by anon/authenticated.
--    These are cron/maintenance/internal-trigger helpers.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escalate_admin_denied_spikes()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escalate_high_risk_alerts()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake()                                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_visa_attachment_added()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_visa_attachment_removed()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_visa_checklist_item_change()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_denied_spike()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_rate_limit_buckets()                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_security_audit_log()                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_security_scan_runs()                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_uptime_checks()                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_admin_denial(text)                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_security_linter()                                  FROM PUBLIC, anon, authenticated;

-- Keep predicate helpers callable by authenticated (used inside RLS).
-- has_role / is_pro / is_pro_feature_enabled are safe: parameterised, security-definer, own-scope only.
-- get_public_profile_whatsapp is intentionally public (public profile page uses it via anon).
-- We still explicitly re-grant to be defensive.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)                         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid)                                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro_feature_enabled(uuid, text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_whatsapp(text)                       TO anon, authenticated;

-- ============================================================
-- 3) jobs — restrict anon to safe columns only
--    Sensitive columns (per security memory + finding):
--      recruitment_email, recruitment_phone, recruitment_contact_name,
--      employer_address, raw_feed_data
-- ============================================================
-- Drop over-broad table grants for anon (writes and blanket SELECT).
REVOKE ALL ON public.jobs FROM anon;

-- Grant SELECT only on public-safe columns.
GRANT SELECT (
  id,
  external_case_number,
  visa_type,
  job_title,
  employer_name,
  worksite_state,
  worksite_city,
  wage_offered,
  wage_unit,
  start_date,
  end_date,
  total_openings,
  recruitment_website,
  posted_date,
  imported_at
) ON public.jobs TO anon;

-- authenticated keeps read access to everything (used in signed-in flows).
-- Drop write privileges: jobs is read-only for end users; only service_role writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.jobs FROM authenticated;
GRANT SELECT ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;

-- ============================================================
-- 4) my_profile — restrict anon to public-safe columns only
--    Sensitive (per finding + memory): birth_date, phone,
--    application_quality_score, resume_completion_pct,
--    onboarding_*, video_script_*, field_experience,
--    physical_conditions, has_prior_h2_experience.
--    Public columns are only those needed to render the shared page.
-- ============================================================
REVOKE ALL ON public.my_profile FROM anon;

GRANT SELECT (
  id,
  owner_id,
  full_name,
  photo_url,
  country,
  city,
  state,
  languages,
  public_slug,
  public_headline,
  public_page_enabled,
  youtube_video_url,
  video_youtube_meta
) ON public.my_profile TO anon;

-- Authenticated already scopes to auth.uid() via RLS — no change needed there
-- beyond making sure service_role stays whole.
GRANT ALL ON public.my_profile TO service_role;
