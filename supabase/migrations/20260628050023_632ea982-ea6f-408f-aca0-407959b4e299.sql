
-- 1) my_profile: restrict anon to safe columns only (drop birth_date, application_quality_score, resume_completion_pct exposure)
REVOKE SELECT ON public.my_profile FROM anon;
GRANT SELECT (
  owner_id, full_name, photo_url, country, phone, languages,
  has_prior_h2_experience, public_slug, public_headline, public_page_enabled
) ON public.my_profile TO anon;

-- 2) jobs: restrict anon to non-PII columns (drop recruitment contact details and raw feed)
REVOKE SELECT ON public.jobs FROM anon;
GRANT SELECT (
  id, external_case_number, visa_type, job_title, employer_name,
  worksite_state, worksite_city, wage_offered, wage_unit,
  start_date, end_date, total_openings, recruitment_website,
  posted_date, imported_at
) ON public.jobs TO anon;

-- 3) profile_views: replace permissive WITH CHECK (true) with one that
--    validates owner_id corresponds to a real public profile for that slug.
DROP POLICY IF EXISTS "anyone can insert a view" ON public.profile_views;
CREATE POLICY "anon can insert view for real public profile"
  ON public.profile_views
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.my_profile p
      WHERE p.owner_id = profile_views.owner_id
        AND p.public_slug = profile_views.slug
        AND p.public_page_enabled = true
    )
  );
