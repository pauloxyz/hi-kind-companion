-- Realtime alert pipeline for admin_access_denied_spike

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Private config table (one row) holding webhook URL + shared HMAC secret.
CREATE TABLE IF NOT EXISTS public.private_spike_alert_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  webhook_url text NOT NULL,
  shared_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

-- service_role-only; no anon/authenticated grants.
REVOKE ALL ON public.private_spike_alert_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_spike_alert_config TO service_role;

ALTER TABLE public.private_spike_alert_config ENABLE ROW LEVEL SECURITY;
-- intentionally no policies: blocks all non-service_role access.

-- 2. Trigger function: posts signed HTTP request to internal webhook.
CREATE OR REPLACE FUNCTION public.notify_admin_denied_spike()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.private_spike_alert_config;
  payload jsonb;
  body_text text;
  sig text;
BEGIN
  IF NEW.event_type <> 'admin_access_denied_spike' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cfg FROM public.private_spike_alert_config WHERE id = true;
  IF cfg.webhook_url IS NULL OR NOT cfg.enabled THEN
    RETURN NEW; -- not configured yet; silently no-op
  END IF;

  payload := jsonb_build_object(
    'id', NEW.id,
    'event_type', NEW.event_type,
    'severity', NEW.severity,
    'user_id', NEW.user_id,
    'resource', NEW.resource,
    'metadata', NEW.metadata,
    'created_at', NEW.created_at
  );
  body_text := payload::text;
  sig := encode(hmac(body_text, cfg.shared_secret, 'sha256'), 'hex');

  PERFORM net.http_post(
    url := cfg.webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-spike-signature', sig
    ),
    body := payload
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admin_denied_spike() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_admin_denied_spike() TO service_role;

-- 3. AFTER INSERT trigger filtered to the spike event_type.
DROP TRIGGER IF EXISTS trg_notify_admin_denied_spike ON public.security_audit_log;
CREATE TRIGGER trg_notify_admin_denied_spike
AFTER INSERT ON public.security_audit_log
FOR EACH ROW
WHEN (NEW.event_type = 'admin_access_denied_spike')
EXECUTE FUNCTION public.notify_admin_denied_spike();
