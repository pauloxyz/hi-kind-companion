ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS severity text;
CREATE INDEX IF NOT EXISTS idx_security_audit_log_severity ON public.security_audit_log(severity);