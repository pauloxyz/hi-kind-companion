-- 1) Tabela de eventos de onboarding (auditoria server-side do funil)
CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event        TEXT NOT NULL,
  step_index   SMALLINT,
  step_label   TEXT,
  props        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_events_user_id_idx     ON public.onboarding_events(user_id);
CREATE INDEX IF NOT EXISTS onboarding_events_event_idx       ON public.onboarding_events(event);
CREATE INDEX IF NOT EXISTS onboarding_events_created_at_idx  ON public.onboarding_events(created_at DESC);

-- 2) GRANTs (Data API)
GRANT SELECT, INSERT ON public.onboarding_events TO authenticated;
GRANT ALL ON public.onboarding_events TO service_role;

-- 3) RLS
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own onboarding events"
  ON public.onboarding_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own onboarding events"
  ON public.onboarding_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins read all onboarding events"
  ON public.onboarding_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Trigger de validação no servidor para my_profile
--    Garante idade (via birth_date), UF e WhatsApp válidos mesmo se o front for burlado.
CREATE OR REPLACE FUNCTION public.validate_my_profile_input()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  age_years integer;
  digits text;
BEGIN
  -- Idade (16-80) quando birth_date informado
  IF NEW.birth_date IS NOT NULL THEN
    age_years := date_part('year', age(NEW.birth_date))::int;
    IF age_years < 16 OR age_years > 80 THEN
      RAISE EXCEPTION 'Idade inválida: deve estar entre 16 e 80 anos (recebido %).', age_years
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- UF: 2 letras maiúsculas (A-Z)
  IF NEW.state IS NOT NULL AND NEW.state <> '' THEN
    NEW.state := upper(trim(NEW.state));
    IF NEW.state !~ '^[A-Z]{2}$' THEN
      RAISE EXCEPTION 'UF inválida: use 2 letras (recebido %).', NEW.state
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- WhatsApp: pelo menos 10 dígitos, no máximo 15 (E.164)
  IF NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
    digits := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(digits) < 10 OR length(digits) > 15 THEN
      RAISE EXCEPTION 'WhatsApp inválido: % dígitos (esperado entre 10 e 15).', length(digits)
        USING ERRCODE = '22023';
    END IF;
    -- Normaliza: só dígitos
    NEW.phone := digits;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_my_profile_input_trg ON public.my_profile;
CREATE TRIGGER validate_my_profile_input_trg
  BEFORE INSERT OR UPDATE ON public.my_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_my_profile_input();