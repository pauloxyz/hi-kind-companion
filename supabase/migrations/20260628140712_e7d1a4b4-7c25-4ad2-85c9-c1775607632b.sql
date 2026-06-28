
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'hibp_block','weak_password_block','pii_access',
                  'admin_action','auth_failure'
                )),
  user_id       UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email_hash    TEXT NULL,
  ip_address    INET NULL,
  user_agent    TEXT NULL,
  resource      TEXT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_log_event_idx ON public.security_audit_log (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_user_idx  ON public.security_audit_log (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;
GRANT INSERT ON public.security_audit_log TO anon;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins read everything
CREATE POLICY "admins read security audit"
  ON public.security_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users may insert their own auth/PII events
CREATE POLICY "users insert own security events"
  ON public.security_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Anonymous flows (signup HIBP block) may insert anon events with no user_id
CREATE POLICY "anon insert pre-auth security events"
  ON public.security_audit_log
  FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
    AND event_type IN ('hibp_block','weak_password_block','auth_failure')
  );

-- Admin reporting views
CREATE OR REPLACE VIEW public.security_hibp_daily AS
SELECT date_trunc('day', created_at) AS day,
       COUNT(*) FILTER (WHERE event_type='hibp_block')         AS hibp_blocks,
       COUNT(*) FILTER (WHERE event_type='weak_password_block') AS weak_blocks,
       COUNT(*) FILTER (WHERE event_type='auth_failure')        AS auth_failures
FROM public.security_audit_log
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.security_pii_access_recent AS
SELECT created_at, user_id, resource, metadata
FROM public.security_audit_log
WHERE event_type='pii_access'
ORDER BY created_at DESC
LIMIT 500;

GRANT SELECT ON public.security_hibp_daily        TO authenticated;
GRANT SELECT ON public.security_pii_access_recent TO authenticated;
