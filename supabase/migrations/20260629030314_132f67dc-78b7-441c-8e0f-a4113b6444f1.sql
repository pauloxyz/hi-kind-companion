
-- Allow admin_access_denied_spike events in the audit log
ALTER TABLE public.security_audit_log
  DROP CONSTRAINT IF EXISTS security_audit_log_event_type_check;

ALTER TABLE public.security_audit_log
  ADD CONSTRAINT security_audit_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'hibp_block','weak_password_block','auth_failure','pii_access','admin_action',
    'settings_viewed','password_changed','password_change_failed','email_change_requested',
    'email_change_failed','account_deletion_requested','account_deleted','language_changed',
    'theme_changed','alert_acked','alert_unacked','reauth_failed','admin_access_denied',
    'high_risk_alert','role_change','admin_access_denied_spike'
  ]));

-- Detects spikes of admin_access_denied events and writes a single alert row per
-- (user or route) per hour. Threshold: 10+ denials per 1h window per dimension.
CREATE OR REPLACE FUNCTION public.escalate_admin_denied_spikes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted integer := 0;
  per_user_inserted integer := 0;
  per_route_inserted integer := 0;
  threshold constant integer := 10;
BEGIN
  -- Spike per user
  WITH spikes AS (
    SELECT user_id, count(*) AS hits, max(created_at) AS last_at
    FROM public.security_audit_log
    WHERE created_at > now() - interval '1 hour'
      AND event_type = 'admin_access_denied'
      AND user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) >= threshold
  ),
  ins AS (
    INSERT INTO public.security_audit_log (event_type, severity, user_id, metadata, created_at)
    SELECT 'admin_access_denied_spike',
           'high',
           s.user_id,
           jsonb_build_object(
             'dimension', 'user',
             'hits_last_hour', s.hits,
             'threshold', threshold,
             'last_at', s.last_at
           ),
           now()
    FROM spikes s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.security_audit_log l
      WHERE l.event_type = 'admin_access_denied_spike'
        AND l.user_id = s.user_id
        AND (l.metadata->>'dimension') = 'user'
        AND l.created_at > now() - interval '1 hour'
    )
    RETURNING 1
  )
  SELECT count(*) INTO per_user_inserted FROM ins;

  -- Spike per route/resource
  WITH spikes AS (
    SELECT resource, count(*) AS hits, max(created_at) AS last_at
    FROM public.security_audit_log
    WHERE created_at > now() - interval '1 hour'
      AND event_type = 'admin_access_denied'
      AND resource IS NOT NULL
    GROUP BY resource
    HAVING count(*) >= threshold
  ),
  ins AS (
    INSERT INTO public.security_audit_log (event_type, severity, resource, metadata, created_at)
    SELECT 'admin_access_denied_spike',
           'high',
           s.resource,
           jsonb_build_object(
             'dimension', 'route',
             'hits_last_hour', s.hits,
             'threshold', threshold,
             'last_at', s.last_at
           ),
           now()
    FROM spikes s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.security_audit_log l
      WHERE l.event_type = 'admin_access_denied_spike'
        AND l.resource = s.resource
        AND (l.metadata->>'dimension') = 'route'
        AND l.created_at > now() - interval '1 hour'
    )
    RETURNING 1
  )
  SELECT count(*) INTO per_route_inserted FROM ins;

  inserted := COALESCE(per_user_inserted,0) + COALESCE(per_route_inserted,0);
  RETURN inserted;
END;
$$;

-- Schedule every 15 minutes alongside the existing risk alert escalator
SELECT cron.unschedule('escalate-admin-denied-spikes')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='escalate-admin-denied-spikes');

SELECT cron.schedule(
  'escalate-admin-denied-spikes',
  '*/15 * * * *',
  $cron$ SELECT public.escalate_admin_denied_spikes(); $cron$
);

-- Default retention for the new spike event type (90 days)
INSERT INTO public.security_retention_policy (event_type, retain_days)
VALUES ('admin_access_denied_spike', 90)
ON CONFLICT (event_type) DO NOTHING;
