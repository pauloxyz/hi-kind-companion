
ALTER TABLE public.security_audit_log
  DROP CONSTRAINT IF EXISTS security_audit_log_event_type_check;

ALTER TABLE public.security_audit_log
  ADD CONSTRAINT security_audit_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'hibp_block',
    'weak_password_block',
    'auth_failure',
    'pii_access',
    'admin_action',
    'settings_viewed',
    'password_changed',
    'password_change_failed',
    'email_change_requested',
    'email_change_failed',
    'account_deletion_requested',
    'language_changed',
    'theme_changed'
  ]));
