-- Defense-in-depth: revoke all anon privileges on admin/security tables.
-- RLS already blocked anon, but the table-level grant should match policy scope.
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.seo_scan_runs FROM anon;
REVOKE ALL ON public.security_audit_log FROM anon;
REVOKE ALL ON public.security_retention_policy FROM anon;
REVOKE ALL ON public.security_alert_acks FROM anon;
REVOKE ALL ON public.uptime_checks FROM anon;

-- Re-affirm explicit grants on user_roles (auth-only + service role).
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Index to speed up queries that list denied admin attempts.
CREATE INDEX IF NOT EXISTS security_audit_log_event_type_created_at_idx
  ON public.security_audit_log (event_type, created_at DESC);