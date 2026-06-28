
-- Retention & purge: delete audit logs older than 180 days, daily at 03:00 UTC
CREATE OR REPLACE FUNCTION public.purge_security_audit_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM public.security_audit_log
   WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_security_audit_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_security_audit_log() TO service_role;

-- Schedule daily purge (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('purge-security-audit-log');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-security-audit-log',
  '0 3 * * *',
  $$SELECT public.purge_security_audit_log();$$
);

-- Risk alerts view: rolling 1-hour window of suspicious activity per IP
CREATE OR REPLACE VIEW public.security_risk_alerts
WITH (security_invoker = true)
AS
SELECT
  date_trunc('hour', created_at) AS hour,
  ip_address,
  count(*) FILTER (WHERE event_type = 'hibp_block')          AS hibp_blocks,
  count(*) FILTER (WHERE event_type = 'weak_password_block') AS weak_blocks,
  count(*) FILTER (WHERE event_type = 'auth_failure')        AS auth_failures,
  count(*) AS total_events,
  CASE
    WHEN count(*) FILTER (WHERE event_type = 'auth_failure') >= 10 THEN 'high'
    WHEN count(*) >= 20 THEN 'high'
    WHEN count(*) FILTER (WHERE event_type = 'auth_failure') >= 5  THEN 'medium'
    WHEN count(*) >= 10 THEN 'medium'
    ELSE 'low'
  END AS risk_level
FROM public.security_audit_log
WHERE created_at >= now() - interval '24 hours'
  AND ip_address IS NOT NULL
GROUP BY date_trunc('hour', created_at), ip_address
HAVING count(*) >= 5
ORDER BY hour DESC, total_events DESC;

GRANT SELECT ON public.security_risk_alerts TO authenticated;
