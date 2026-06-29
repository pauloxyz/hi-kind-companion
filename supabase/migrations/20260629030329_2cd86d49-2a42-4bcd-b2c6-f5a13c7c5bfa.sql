
REVOKE EXECUTE ON FUNCTION public.escalate_admin_denied_spikes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_admin_denied_spikes() TO service_role;
