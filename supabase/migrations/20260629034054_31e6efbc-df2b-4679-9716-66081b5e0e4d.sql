CREATE OR REPLACE FUNCTION public.notify_admin_denied_spike()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
    RETURN NEW;
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
  sig := encode(extensions.hmac(body_text, cfg.shared_secret, 'sha256'), 'hex');

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
$function$;