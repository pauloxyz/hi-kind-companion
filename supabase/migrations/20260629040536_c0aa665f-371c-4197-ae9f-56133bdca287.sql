
-- 1) Public profile view (no birth_date, no flags-internal fields)
DROP POLICY IF EXISTS "anon reads enabled public profile" ON public.my_profile;

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  owner_id,
  public_slug,
  public_headline,
  full_name,
  country,
  languages,
  has_prior_h2_experience,
  photo_url,
  phone
FROM public.my_profile
WHERE public_page_enabled = true AND public_slug IS NOT NULL;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 2) Public jobs view (no recruiter contact, no raw feed, no employer_address)
DROP POLICY IF EXISTS "anon can read jobs" ON public.jobs;

CREATE OR REPLACE VIEW public.public_jobs
WITH (security_invoker = false) AS
SELECT
  id,
  external_case_number,
  visa_type,
  job_title,
  employer_name,
  worksite_state,
  worksite_city,
  wage_offered,
  wage_unit,
  start_date,
  end_date,
  total_openings,
  posted_date,
  imported_at
FROM public.jobs;

GRANT SELECT ON public.public_jobs TO anon, authenticated;

-- 3) Explicit admin-only SELECT on private_spike_alert_config (was fail-closed; now explicit)
DROP POLICY IF EXISTS "admins read spike alert config" ON public.private_spike_alert_config;
CREATE POLICY "admins read spike alert config"
ON public.private_spike_alert_config
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
