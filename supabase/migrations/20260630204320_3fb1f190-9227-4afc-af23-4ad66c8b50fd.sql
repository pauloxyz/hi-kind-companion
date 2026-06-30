ALTER VIEW public.public_profiles SET (security_invoker = true);
ALTER VIEW public.public_jobs SET (security_invoker = true);
ALTER VIEW public.security_pii_access_recent SET (security_invoker = true);
ALTER VIEW public.security_hibp_daily SET (security_invoker = true);
ALTER VIEW public.security_risk_alerts SET (security_invoker = true);