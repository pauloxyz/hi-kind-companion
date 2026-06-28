
-- 1) Retention policy table
CREATE TABLE IF NOT EXISTS public.security_retention_policy (
  event_type   text PRIMARY KEY,
  retain_days  integer NOT NULL CHECK (retain_days BETWEEN 7 AND 3650),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_retention_policy TO authenticated;
GRANT ALL ON public.security_retention_policy TO service_role;

ALTER TABLE public.security_retention_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read retention policy"
  ON public.security_retention_policy FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upsert retention policy"
  ON public.security_retention_policy FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update retention policy"
  ON public.security_retention_policy FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete retention policy"
  ON public.security_retention_policy FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Sensible defaults
INSERT INTO public.security_retention_policy (event_type, retain_days) VALUES
  ('hibp_block', 365),
  ('weak_password_block', 365),
  ('auth_failure', 365),
  ('pii_access', 365),
  ('admin_action', 730),
  ('settings_viewed', 30),
  ('password_changed', 365),
  ('password_change_failed', 365),
  ('email_change_requested', 365),
  ('email_change_failed', 365),
  ('account_deletion_requested', 730),
  ('account_deleted', 1825),
  ('language_changed', 30),
  ('theme_changed', 30),
  ('alert_acked', 365),
  ('alert_unacked', 365),
  ('reauth_failed', 365)
ON CONFLICT (event_type) DO NOTHING;

-- 2) Update purge function to use policy table
CREATE OR REPLACE FUNCTION public.purge_security_audit_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_deleted integer := 0;
  policy_deleted integer;
  unmatched_deleted integer;
BEGIN
  -- delete per-event-type using each row's policy
  WITH deletions AS (
    DELETE FROM public.security_audit_log l
    USING public.security_retention_policy p
    WHERE l.event_type = p.event_type
      AND l.created_at < now() - make_interval(days => p.retain_days)
    RETURNING 1
  )
  SELECT count(*) INTO policy_deleted FROM deletions;

  -- fallback 180-day cap for any event_type without a policy row
  WITH unmatched AS (
    DELETE FROM public.security_audit_log
    WHERE event_type NOT IN (SELECT event_type FROM public.security_retention_policy)
      AND created_at < now() - interval '180 days'
    RETURNING 1
  )
  SELECT count(*) INTO unmatched_deleted FROM unmatched;

  total_deleted := COALESCE(policy_deleted, 0) + COALESCE(unmatched_deleted, 0);
  RETURN total_deleted;
END;
$$;

-- Re-lock (function was just replaced)
REVOKE EXECUTE ON FUNCTION public.purge_security_audit_log() FROM public, anon, authenticated;

-- 3) Notification tracking column
ALTER TABLE public.security_audit_log
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE INDEX IF NOT EXISTS security_audit_log_unnotified_idx
  ON public.security_audit_log (created_at)
  WHERE notified_at IS NULL AND event_type IN ('auth_failure','hibp_block');
