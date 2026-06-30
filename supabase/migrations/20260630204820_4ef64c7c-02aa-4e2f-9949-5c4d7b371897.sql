-- 1) Tabela de histórico
CREATE TABLE public.security_scan_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at  timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL DEFAULT 'pg_cron_linter',
  total       integer NOT NULL DEFAULT 0,
  errors      integer NOT NULL DEFAULT 0,
  warnings    integer NOT NULL DEFAULT 0,
  findings    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX security_scan_runs_scanned_at_idx ON public.security_scan_runs (scanned_at DESC);

GRANT SELECT, DELETE ON public.security_scan_runs TO authenticated;
GRANT ALL ON public.security_scan_runs TO service_role;

ALTER TABLE public.security_scan_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security scan runs"
  ON public.security_scan_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete security scan runs"
  ON public.security_scan_runs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) Função linter — replica os principais checks de segurança do
--    Supabase database linter usando metadados do catálogo. Roda como
--    SECURITY DEFINER porque precisa ler pg_catalog completo (RLS,
--    proconfig de funções etc).
CREATE OR REPLACE FUNCTION public.run_security_linter()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  findings jsonb := '[]'::jsonb;
  rec record;
  err_count int := 0;
  warn_count int := 0;
  new_id uuid;
BEGIN
  -- A) Tabelas em public sem RLS habilitado
  FOR rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    findings := findings || jsonb_build_object(
      'level', 'error',
      'check', 'table_without_rls',
      'object', rec.relname,
      'message', format('Table public.%I has RLS disabled', rec.relname)
    );
    err_count := err_count + 1;
  END LOOP;

  -- B) Views em public sem security_invoker = true
  FOR rec IN
    SELECT c.relname,
           COALESCE((
             SELECT option_value::boolean
             FROM unnest(c.reloptions) AS o(opt),
                  LATERAL split_part(o.opt, '=', 1) AS option_name,
                  LATERAL split_part(o.opt, '=', 2) AS option_value
             WHERE option_name = 'security_invoker'
           ), false) AS si
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
  LOOP
    IF NOT rec.si THEN
      findings := findings || jsonb_build_object(
        'level', 'error',
        'check', 'view_without_security_invoker',
        'object', rec.relname,
        'message', format('View public.%I runs as creator (can bypass RLS)', rec.relname)
      );
      err_count := err_count + 1;
    END IF;
  END LOOP;

  -- C) Funções SECURITY DEFINER em public sem search_path fixo
  FOR rec IN
    SELECT p.proname,
           p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    IF rec.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(rec.proconfig) cfg WHERE cfg LIKE 'search_path=%')
    THEN
      findings := findings || jsonb_build_object(
        'level', 'warn',
        'check', 'security_definer_function_mutable_search_path',
        'object', rec.proname,
        'message', format('Function public.%I is SECURITY DEFINER without fixed search_path', rec.proname)
      );
      warn_count := warn_count + 1;
    END IF;
  END LOOP;

  -- D) Tabelas em public sem nenhum GRANT para authenticated/anon/service_role
  FOR rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public'
          AND g.table_name = c.relname
          AND g.grantee IN ('authenticated', 'anon', 'service_role')
      )
  LOOP
    findings := findings || jsonb_build_object(
      'level', 'error',
      'check', 'table_without_grants',
      'object', rec.relname,
      'message', format('Table public.%I has no GRANT for app roles', rec.relname)
    );
    err_count := err_count + 1;
  END LOOP;

  INSERT INTO public.security_scan_runs(source, total, errors, warnings, findings)
  VALUES ('pg_cron_linter', err_count + warn_count, err_count, warn_count, findings)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_security_linter() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_security_linter() TO service_role;

-- 3) Purge — mantém 90 dias de histórico
CREATE OR REPLACE FUNCTION public.purge_security_scan_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted integer;
BEGIN
  WITH d AS (
    DELETE FROM public.security_scan_runs
    WHERE scanned_at < now() - interval '90 days'
    RETURNING 1
  ) SELECT count(*) INTO deleted FROM d;
  RETURN deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_security_scan_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_security_scan_runs() TO service_role;

-- 4) Agendar cron jobs (idempotente: dropa antes de criar de novo)
DO $$
BEGIN
  PERFORM cron.unschedule('security-linter-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('security-scan-runs-purge');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'security-linter-daily',
  '0 3 * * *',
  $$SELECT public.run_security_linter();$$
);

SELECT cron.schedule(
  'security-scan-runs-purge',
  '15 3 * * *',
  $$SELECT public.purge_security_scan_runs();$$
);

-- Executa uma primeira vez agora pra popular a tabela
SELECT public.run_security_linter();