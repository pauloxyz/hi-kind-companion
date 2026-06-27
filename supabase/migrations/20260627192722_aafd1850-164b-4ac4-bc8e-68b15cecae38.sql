
ALTER TABLE public.my_profile
  ADD COLUMN IF NOT EXISTS public_slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS public_headline TEXT,
  ADD COLUMN IF NOT EXISTS public_page_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS my_profile_public_slug_idx ON public.my_profile(public_slug) WHERE public_slug IS NOT NULL;

-- Profile views tracking
CREATE TABLE IF NOT EXISTS public.profile_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  slug TEXT NOT NULL,
  viewer_ip TEXT,
  user_agent TEXT,
  referer TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profile_views TO authenticated;
GRANT INSERT, SELECT ON public.profile_views TO anon;
GRANT ALL ON public.profile_views TO service_role;

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own views" ON public.profile_views
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "anyone can insert a view" ON public.profile_views
  FOR INSERT TO anon WITH CHECK (true);

CREATE INDEX IF NOT EXISTS profile_views_owner_idx ON public.profile_views(owner_id, viewed_at DESC);

-- Public read policies for the shareable page (anon)
GRANT SELECT ON public.my_profile TO anon;
GRANT SELECT ON public.work_media TO anon;
GRANT SELECT ON public.intro_video TO anon;
GRANT SELECT ON public.resume_experiences TO anon;
GRANT SELECT ON public.resume_skills TO anon;

CREATE POLICY "anon reads enabled public profile" ON public.my_profile
  FOR SELECT TO anon USING (public_slug IS NOT NULL AND public_page_enabled = true);

CREATE POLICY "anon reads featured media of public profiles" ON public.work_media
  FOR SELECT TO anon USING (
    is_featured = true AND EXISTS (
      SELECT 1 FROM public.my_profile p
      WHERE p.owner_id = work_media.owner_id AND p.public_slug IS NOT NULL AND p.public_page_enabled = true
    )
  );

CREATE POLICY "anon reads active intro of public profiles" ON public.intro_video
  FOR SELECT TO anon USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM public.my_profile p
      WHERE p.owner_id = intro_video.owner_id AND p.public_slug IS NOT NULL AND p.public_page_enabled = true
    )
  );

CREATE POLICY "anon reads experiences of public profiles" ON public.resume_experiences
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.my_profile p
      WHERE p.owner_id = resume_experiences.owner_id AND p.public_slug IS NOT NULL AND p.public_page_enabled = true
    )
  );

CREATE POLICY "anon reads skills of public profiles" ON public.resume_skills
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.my_profile p
      WHERE p.owner_id = resume_skills.owner_id AND p.public_slug IS NOT NULL AND p.public_page_enabled = true
    )
  );

-- Auto-generate a slug for existing profiles missing one
UPDATE public.my_profile
SET public_slug = lower(regexp_replace(coalesce(split_part(full_name,' ',1),'user'), '[^a-z0-9]', '', 'gi')) || '-' || substr(replace(owner_id::text,'-',''),1,6)
WHERE public_slug IS NULL;
