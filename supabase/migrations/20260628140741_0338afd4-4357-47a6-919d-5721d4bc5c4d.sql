
DROP VIEW IF EXISTS public.security_hibp_daily;
DROP VIEW IF EXISTS public.security_pii_access_recent;

CREATE VIEW public.security_hibp_daily
  WITH (security_invoker = true) AS
SELECT date_trunc('day', created_at) AS day,
       COUNT(*) FILTER (WHERE event_type='hibp_block')          AS hibp_blocks,
       COUNT(*) FILTER (WHERE event_type='weak_password_block') AS weak_blocks,
       COUNT(*) FILTER (WHERE event_type='auth_failure')        AS auth_failures
FROM public.security_audit_log
GROUP BY 1
ORDER BY 1 DESC;

CREATE VIEW public.security_pii_access_recent
  WITH (security_invoker = true) AS
SELECT created_at, user_id, resource, metadata
FROM public.security_audit_log
WHERE event_type='pii_access'
ORDER BY created_at DESC
LIMIT 500;

GRANT SELECT ON public.security_hibp_daily        TO authenticated;
GRANT SELECT ON public.security_pii_access_recent TO authenticated;
