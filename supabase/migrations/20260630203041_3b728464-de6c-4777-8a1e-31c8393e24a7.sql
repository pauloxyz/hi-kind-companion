CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  owner_id,
  public_slug,
  public_headline,
  full_name,
  country,
  languages,
  has_prior_h2_experience,
  photo_url,
  youtube_video_url
FROM public.my_profile
WHERE public_page_enabled = true AND public_slug IS NOT NULL;