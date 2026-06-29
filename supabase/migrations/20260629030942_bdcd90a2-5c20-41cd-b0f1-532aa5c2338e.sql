
CREATE TABLE IF NOT EXISTS public.admin_denied_spike_config (
  id boolean PRIMARY KEY DEFAULT true,
  threshold integer NOT NULL DEFAULT 10,
  window_minutes integer NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT admin_denied_spike_config_singleton CHECK (id = true),
  CONSTRAINT admin_denied_spike_config_threshold_range CHECK (threshold BETWEEN 1 AND 1000),
  CONSTRAINT admin_denied_spike_config_window_range CHECK (window_minutes BETWEEN 5 AND 1440)
);

GRANT SELECT, INSERT, UPDATE ON public.admin_denied_spike_config TO authenticated;
GRANT ALL ON public.admin_denied_spike_config TO service_role;

ALTER TABLE public.admin_denied_spike_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read spike config"
  ON public.admin_denied_spike_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins upsert spike config"
  ON public.admin_denied_spike_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update spike config"
  ON public.admin_denied_spike_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed singleton row
INSERT INTO public.admin_denied_spike_config (id, threshold, window_minutes)
VALUES (true, 10, 60)
ON CONFLICT (id) DO NOTHING;

-- Refactor the escalator to read threshold/window from the config row
CREATE OR REPLACE FUNCTION public.escalate_admin_denied_spikes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  per_user_inserted integer := 0;
  per_route_inserted integer := 0;
  cfg_threshold integer;
  cfg_window integer;
  win_interval interval;
BEGIN
  SELECT threshold, window_minutes INTO cfg_threshold, cfg_window
    FROM public.admin_denied_spike_config WHERE id = true;
  cfg_threshold := COALESCE(cfg_threshold, 10);
  cfg_window := COALESCE(cfg_window, 60);
  win_interval := make_interval(mins => cfg_window);

  WITH spikes AS (
    SELECT user_id, count(*) AS hits, max(created_at) AS last_at
    FROM public.security_audit_log
    WHERE created_at > now() - win_interval
      AND event_type = 'admin_access_denied'
      AND user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) >= cfg_threshold
  ),
  ins AS (
    INSERT INTO public.security_audit_log (event_type, severity, user_id, metadata, created_at)
    SELECT 'admin_access_denied_spike','high',s.user_id,
           jsonb_build_object(
             'dimension','user',
             'hits_in_window', s.hits,
             'threshold', cfg_threshold,
             'window_minutes', cfg_window,
             'last_at', s.last_at
           ), now()
    FROM spikes s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.security_audit_log l
      WHERE l.event_type = 'admin_access_denied_spike'
        AND l.user_id = s.user_id
        AND (l.metadata->>'dimension') = 'user'
        AND l.created_at > now() - win_interval
    ) RETURNING 1
  ) SELECT count(*) INTO per_user_inserted FROM ins;

  WITH spikes AS (
    SELECT resource, count(*) AS hits, max(created_at) AS last_at
    FROM public.security_audit_log
    WHERE created_at > now() - win_interval
      AND event_type = 'admin_access_denied'
      AND resource IS NOT NULL
    GROUP BY resource
    HAVING count(*) >= cfg_threshold
  ),
  ins AS (
    INSERT INTO public.security_audit_log (event_type, severity, resource, metadata, created_at)
    SELECT 'admin_access_denied_spike','high',s.resource,
           jsonb_build_object(
             'dimension','route',
             'hits_in_window', s.hits,
             'threshold', cfg_threshold,
             'window_minutes', cfg_window,
             'last_at', s.last_at
           ), now()
    FROM spikes s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.security_audit_log l
      WHERE l.event_type = 'admin_access_denied_spike'
        AND l.resource = s.resource
        AND (l.metadata->>'dimension') = 'route'
        AND l.created_at > now() - win_interval
    ) RETURNING 1
  ) SELECT count(*) INTO per_route_inserted FROM ins;

  RETURN COALESCE(per_user_inserted,0) + COALESCE(per_route_inserted,0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.escalate_admin_denied_spikes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_admin_denied_spikes() TO service_role;
