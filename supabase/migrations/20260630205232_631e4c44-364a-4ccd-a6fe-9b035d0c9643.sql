-- 1) Recriar a view sem owner_id
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT
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

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 2) Remover o GRANT amplo de SELECT para anon em my_profile e
--    substituir por GRANT por coluna (apenas as colunas seguras).
--    A policy "anon reads enabled public profile cols" continua
--    válida e filtra por linha (public_page_enabled = true).
REVOKE SELECT ON public.my_profile FROM anon;

GRANT SELECT (
  public_slug,
  public_headline,
  full_name,
  country,
  languages,
  has_prior_h2_experience,
  photo_url,
  youtube_video_url,
  public_page_enabled
) ON public.my_profile TO anon;