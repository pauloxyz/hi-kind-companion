-- 1. Allow the new event_type in the CHECK constraint.
ALTER TABLE public.security_audit_log
  DROP CONSTRAINT IF EXISTS security_audit_log_event_type_check;

ALTER TABLE public.security_audit_log
  ADD CONSTRAINT security_audit_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'hibp_block','weak_password_block','auth_failure','pii_access',
    'admin_action','settings_viewed','password_changed','password_change_failed',
    'email_change_requested','email_change_failed','account_deletion_requested',
    'account_deleted','language_changed','theme_changed','alert_acked',
    'alert_unacked','reauth_failed','admin_access_denied','high_risk_alert',
    'role_change'
  ]));

-- 2. SECURITY DEFINER fn that logs the denial. Bypasses user-scope RLS but
-- always pins user_id = auth.uid() and event_type = 'admin_access_denied'.
CREATE OR REPLACE FUNCTION public.record_admin_denial(_resource text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN; -- never log anonymous attempts here; rate-limit/anon path is separate
  END IF;
  INSERT INTO public.security_audit_log(event_type, user_id, resource, metadata)
  VALUES (
    'admin_access_denied',
    auth.uid(),
    COALESCE(NULLIF(left(_resource, 200), ''), 'unknown'),
    jsonb_build_object('reason', 'missing_admin_role', 'severity', 'medium')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_admin_denial(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_admin_denial(text) TO authenticated;