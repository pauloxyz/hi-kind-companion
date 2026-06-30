-- 1) profile_variants ---------------------------------------------------------
CREATE TABLE public.profile_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,                  -- "Colheita", "Packing"...
  label text,                          -- subtítulo curto
  job_title_pt text,
  job_title_en text,
  summary_pt text,
  summary_en text,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlighted_experience_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_path text,                       -- caminho no bucket 'resumes'
  pdf_filename text,
  source text NOT NULL DEFAULT 'variant' CHECK (source IN ('variant','upload')),
  is_active boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profile_variants_owner_idx ON public.profile_variants(owner_id);
CREATE UNIQUE INDEX profile_variants_one_active
  ON public.profile_variants(owner_id) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_variants TO authenticated;
GRANT ALL ON public.profile_variants TO service_role;
ALTER TABLE public.profile_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own variants"
  ON public.profile_variants FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER profile_variants_set_updated
  BEFORE UPDATE ON public.profile_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) pro_features (catálogo) --------------------------------------------------
CREATE TABLE public.pro_features (
  feature_key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  enabled_for_pro boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pro_features TO authenticated;
GRANT ALL ON public.pro_features TO service_role;
ALTER TABLE public.pro_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone signed in reads pro features"
  ON public.pro_features FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage pro features"
  ON public.pro_features FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pro_features_set_updated
  BEFORE UPDATE ON public.pro_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) pro_feature_overrides ----------------------------------------------------
CREATE TABLE public.pro_feature_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.pro_features(feature_key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_key)
);
GRANT SELECT ON public.pro_feature_overrides TO authenticated;
GRANT ALL ON public.pro_feature_overrides TO service_role;
ALTER TABLE public.pro_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own overrides"
  ON public.pro_feature_overrides FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage overrides"
  ON public.pro_feature_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pro_feature_overrides_set_updated
  BEFORE UPDATE ON public.pro_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) helper: is_pro_feature_enabled ------------------------------------------
CREATE OR REPLACE FUNCTION public.is_pro_feature_enabled(_user_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ovr boolean;
  base boolean;
BEGIN
  SELECT enabled INTO ovr
    FROM public.pro_feature_overrides
    WHERE user_id = _user_id AND feature_key = _feature_key;
  IF FOUND THEN RETURN ovr; END IF;

  IF NOT public.is_pro(_user_id) THEN RETURN false; END IF;

  SELECT enabled_for_pro INTO base
    FROM public.pro_features WHERE feature_key = _feature_key;
  RETURN COALESCE(base, false);
END;
$$;

-- 5) seed catálogo ------------------------------------------------------------
INSERT INTO public.pro_features (feature_key, label, description, enabled_for_pro) VALUES
  ('english_full',          'Curso de inglês H-2A completo', 'Libera todos os módulos e flashcards SRS', true),
  ('multiple_resumes',      'Múltiplos currículos',          'Variantes + upload de PDFs por vaga',     true),
  ('auto_translate',        'Tradução automática PT→EN',     'Currículo e mensagens em inglês com IA',  true),
  ('priority_visibility',   'Fila prioritária de visualização','Perfil aparece primeiro pra recrutadores', true),
  ('visa_advanced',         'Checklist de visto avançada',   'Prazos, documentos e lembretes',          true),
  ('verified_badge',        'Selo de verificado',            'Selo para perfis revisados',              true),
  ('priority_support',      'Suporte prioritário',           'WhatsApp/chat com SLA reduzido',          true),
  ('profile_stats',         'Estatísticas avançadas do perfil','Views, estado, taxa de resposta',       true)
ON CONFLICT (feature_key) DO NOTHING;
