
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limit_buckets TO service_role;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages rate limit" ON public.rate_limit_buckets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
  _max integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket public.rate_limit_buckets;
BEGIN
  INSERT INTO public.rate_limit_buckets(key) VALUES (_key)
    ON CONFLICT (key) DO NOTHING;
  SELECT * INTO bucket FROM public.rate_limit_buckets WHERE key = _key FOR UPDATE;
  IF bucket.window_start < now() - make_interval(secs => _window_seconds) THEN
    UPDATE public.rate_limit_buckets
      SET count = 1, window_start = now()
      WHERE key = _key;
    RETURN true;
  END IF;
  IF bucket.count >= _max THEN
    RETURN false;
  END IF;
  UPDATE public.rate_limit_buckets SET count = count + 1 WHERE key = _key;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- periodic cleanup of stale buckets (older than 1 day)
CREATE OR REPLACE FUNCTION public.purge_rate_limit_buckets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted integer;
BEGIN
  WITH d AS (
    DELETE FROM public.rate_limit_buckets
    WHERE window_start < now() - interval '1 day'
    RETURNING 1
  ) SELECT count(*) INTO deleted FROM d;
  RETURN deleted;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_rate_limit_buckets() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-rate-limit-buckets') THEN
    PERFORM cron.unschedule('purge-rate-limit-buckets');
  END IF;
  PERFORM cron.schedule(
    'purge-rate-limit-buckets',
    '15 3 * * *',
    $cron$ SELECT public.purge_rate_limit_buckets(); $cron$
  );
END $$;
