
-- ============================================================
-- Phase 1 hardening: column-level PII protection, function lockdown,
-- alert acknowledgements table
-- ============================================================

-- 1) my_profile: revoke PII (phone, birth_date) from anonymous read
REVOKE SELECT (phone, birth_date) ON public.my_profile FROM anon;

-- 2) jobs: revoke recruiter contact PII from anonymous read
REVOKE SELECT (recruitment_email, recruitment_phone, recruitment_contact_name)
  ON public.jobs FROM anon;

-- 3) profile_views: revoke visitor IP/UA from authenticated owners
--    (owners can still aggregate / count views; raw IP/UA stays admin-only)
REVOKE SELECT (viewer_ip, user_agent) ON public.profile_views FROM authenticated;

-- 4) Lock down trigger-only / cron-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user()           FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_security_audit_log()  FROM public, anon, authenticated;

-- 5) Reinforce user_roles: explicit deny on self-insertion of any role
--    (existing admin-insert policy stays; we add a stricter WITH CHECK)
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
CREATE POLICY "Admins insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND auth.uid() <> user_id  -- admins cannot grant a role to themselves
  );

-- 6) security_alert_acks: persisted "treated" state for risk alerts
CREATE TABLE IF NOT EXISTS public.security_alert_acks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key    text NOT NULL UNIQUE,         -- "<hour_iso>|<ip>"
  hour         timestamptz NOT NULL,
  ip_address   inet,
  risk_level   text NOT NULL,
  note         text,
  acked_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  acked_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_alert_acks TO authenticated;
GRANT ALL ON public.security_alert_acks TO service_role;

ALTER TABLE public.security_alert_acks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read alert acks"
  ON public.security_alert_acks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert alert acks"
  ON public.security_alert_acks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND acked_by = auth.uid());

CREATE POLICY "Admins update own alert acks"
  ON public.security_alert_acks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete alert acks"
  ON public.security_alert_acks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS security_alert_acks_hour_idx
  ON public.security_alert_acks (hour DESC);
