
-- Tighten: remove anon EXECUTE from role-check helpers.
-- These are only needed by authenticated flows (RLS predicates on tables
-- that anon cannot access anyway) and admin server functions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_pro(uuid)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_pro_feature_enabled(uuid, text) FROM PUBLIC, anon;

-- Ensure authenticated keeps EXECUTE (idempotent).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro_feature_enabled(uuid, text) TO authenticated;
