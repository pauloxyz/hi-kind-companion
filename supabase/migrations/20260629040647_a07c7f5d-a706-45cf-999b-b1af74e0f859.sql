
DROP VIEW IF EXISTS public.public_profiles;
DROP VIEW IF EXISTS public.public_jobs;

-- Re-add narrow anon SELECT policies on base tables so invoker-mode views can read rows.
CREATE POLICY "anon reads enabled public profile cols"
ON public.my_profile FOR SELECT TO anon
USING (public_page_enabled = true AND public_slug IS NOT NULL);

CREATE POLICY "anon reads jobs cols"
ON public.jobs FOR SELECT TO anon
USING (true);

-- Ensure table-level grant exists, then column-level revoke for sensitive columns.
GRANT SELECT ON public.my_profile TO anon;
REVOKE SELECT (birth_date, phone, application_quality_score, resume_completion_pct, onboarding_completed_at)
  ON public.my_profile FROM anon;

GRANT SELECT ON public.jobs TO anon;
REVOKE SELECT (recruitment_email, recruitment_phone, recruitment_contact_name, employer_address, raw_feed_data)
  ON public.jobs FROM anon;

-- Recreate views as SECURITY INVOKER, projecting only safe columns
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT
  owner_id,
  public_slug,
  public_headline,
  full_name,
  country,
  languages,
  has_prior_h2_experience,
  photo_url
FROM public.my_profile
WHERE public_page_enabled = true AND public_slug IS NOT NULL;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

CREATE VIEW public.public_jobs
WITH (security_invoker = true) AS
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

-- WhatsApp contact for public profile pages: surface phone only through this audited function.
CREATE OR REPLACE FUNCTION public.get_public_profile_whatsapp(_slug text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phone
  FROM public.my_profile
  WHERE public_slug = _slug
    AND public_page_enabled = true
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_profile_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_whatsapp(text) TO anon, authenticated;
