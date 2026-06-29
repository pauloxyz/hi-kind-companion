
CREATE TABLE public.seo_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'cron' CHECK (source IN ('cron','manual')),
  tests_total integer NOT NULL DEFAULT 0,
  tests_passed integer NOT NULL DEFAULT 0,
  tests_failed integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  high_count integer NOT NULL DEFAULT 0,
  medium_count integer NOT NULL DEFAULT 0,
  low_count integer NOT NULL DEFAULT 0,
  routes_total integer NOT NULL DEFAULT 0,
  routes_in_sitemap integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_seo_scan_runs_created_at ON public.seo_scan_runs (created_at DESC);

GRANT SELECT ON public.seo_scan_runs TO authenticated;
GRANT ALL ON public.seo_scan_runs TO service_role;

ALTER TABLE public.seo_scan_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read seo scan runs"
  ON public.seo_scan_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
