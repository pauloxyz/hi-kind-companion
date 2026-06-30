-- Add fast-onboarding fields to my_profile
ALTER TABLE public.my_profile
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS field_experience TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS physical_conditions TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS onboarding_step SMALLINT NOT NULL DEFAULT 0;

-- These fields are private (personal location + physical info). Do NOT
-- expose to anon. Authenticated owners already have full row access via
-- the existing "users manage own profile" policy — no GRANT change needed.

COMMENT ON COLUMN public.my_profile.field_experience IS
  'Onboarding: tipos de experiência no campo (plantio, colheita, maquinas, irrigacao, outros)';
COMMENT ON COLUMN public.my_profile.physical_conditions IS
  'Onboarding: tolerâncias físicas autodeclaradas (lift, weather, long_hours)';
COMMENT ON COLUMN public.my_profile.onboarding_step IS
  'Última tela concluída do onboarding rápido (0..6). 6 = pronto.';