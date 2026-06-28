
-- 1) my_profile: remove anon access to PII columns by switching to column-level grants
REVOKE SELECT ON public.my_profile FROM anon;
GRANT SELECT (
  id, owner_id, full_name, photo_url, country, languages,
  has_prior_h2_experience, public_slug, public_headline, public_page_enabled
) ON public.my_profile TO anon;

-- 2) feed_import_logs: restrict to admins only (was readable by every authenticated user)
DROP POLICY IF EXISTS "auth can read logs" ON public.feed_import_logs;
CREATE POLICY "admins can read feed logs"
  ON public.feed_import_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Storage: allow anon to read profile-photos belonging to users with a public page
DROP POLICY IF EXISTS "anon reads photos of public profiles" ON storage.objects;
CREATE POLICY "anon reads photos of public profiles"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (
    bucket_id = 'profile-photos'
    AND EXISTS (
      SELECT 1 FROM public.my_profile p
      WHERE p.public_page_enabled = true
        AND p.public_slug IS NOT NULL
        AND p.owner_id::text = (storage.foldername(name))[1]
    )
  );

-- 4) Enable pg_cron and schedule the audit-log purge (daily 03:00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-security-audit-log') THEN
    PERFORM cron.unschedule('purge-security-audit-log');
  END IF;
  PERFORM cron.schedule(
    'purge-security-audit-log',
    '0 3 * * *',
    $cron$ SELECT public.purge_security_audit_log(); $cron$
  );
END $$;

-- 5) Risk-alert escalation: detect HIGH spikes and persist an audit entry once per hour
CREATE OR REPLACE FUNCTION public.escalate_high_risk_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  inserted integer := 0;
BEGIN
  WITH spikes AS (
    SELECT event_type, count(*) AS hits
    FROM public.security_audit_log
    WHERE created_at > now() - interval '1 hour'
      AND event_type IN ('failed_login','pii_access','role_change','account_deleted')
    GROUP BY event_type
    HAVING count(*) >= 10
  ),
  ins AS (
    INSERT INTO public.security_audit_log (event_type, severity, metadata, created_at)
    SELECT 'high_risk_alert',
           'high',
           jsonb_build_object('source_event', s.event_type, 'hits_last_hour', s.hits),
           now()
    FROM spikes s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.security_audit_log l
      WHERE l.event_type = 'high_risk_alert'
        AND l.metadata->>'source_event' = s.event_type
        AND l.created_at > now() - interval '1 hour'
    )
    RETURNING 1
  )
  SELECT count(*) INTO inserted FROM ins;
  RETURN inserted;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.escalate_high_risk_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_high_risk_alerts() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'escalate-high-risk-alerts') THEN
    PERFORM cron.unschedule('escalate-high-risk-alerts');
  END IF;
  PERFORM cron.schedule(
    'escalate-high-risk-alerts',
    '*/15 * * * *',
    $cron$ SELECT public.escalate_high_risk_alerts(); $cron$
  );
END $$;
