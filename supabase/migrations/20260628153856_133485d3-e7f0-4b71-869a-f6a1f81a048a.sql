
CREATE TABLE public.uptime_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  http_status int,
  latency_ms int,
  checks jsonb,
  error text
);
CREATE INDEX idx_uptime_checks_checked_at ON public.uptime_checks (checked_at DESC);

GRANT SELECT ON public.uptime_checks TO authenticated;
GRANT ALL ON public.uptime_checks TO service_role;

ALTER TABLE public.uptime_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read uptime"
  ON public.uptime_checks FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-purge entries older than 30 days
CREATE OR REPLACE FUNCTION public.purge_uptime_checks()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.uptime_checks WHERE checked_at < now() - INTERVAL '30 days';
$$;

REVOKE ALL ON FUNCTION public.purge_uptime_checks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_uptime_checks() TO service_role;
