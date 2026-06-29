-- Endurecer EXECUTE de funções SECURITY DEFINER de manutenção:
-- só service_role pode chamá-las (pg_cron já roda como service_role).
REVOKE EXECUTE ON FUNCTION public.purge_security_audit_log()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_rate_limit_buckets()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_uptime_checks()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escalate_high_risk_alerts()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escalate_admin_denied_spikes()  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.purge_security_audit_log()       TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_rate_limit_buckets()       TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_uptime_checks()            TO service_role;
GRANT EXECUTE ON FUNCTION public.escalate_high_risk_alerts()      TO service_role;
GRANT EXECUTE ON FUNCTION public.escalate_admin_denied_spikes()   TO service_role;