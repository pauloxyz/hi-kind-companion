
-- Tabela única de perfil do usuário (uso pessoal, owner_id = auth.uid)
CREATE TABLE public.my_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  photo_url text,
  country text DEFAULT 'Brazil',
  phone text,
  languages text[] DEFAULT ARRAY['pt']::text[],
  birth_date date,
  has_prior_h2_experience boolean DEFAULT false,
  resume_completion_pct int DEFAULT 0,
  application_quality_score int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_profile TO authenticated;
GRANT ALL ON public.my_profile TO service_role;
ALTER TABLE public.my_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.my_profile FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Currículos
CREATE TABLE public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_pt text,
  summary_en text,
  availability_start date,
  availability_end date,
  template_style text DEFAULT 'manual_labor',
  pdf_url text,
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resumes" ON public.resumes FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.resume_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES public.resumes(id) ON DELETE CASCADE,
  job_title text,
  employer_name text,
  location text,
  start_date date,
  end_date date,
  description_pt text,
  description_en text,
  sort_order int DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_experiences TO authenticated;
GRANT ALL ON public.resume_experiences TO service_role;
ALTER TABLE public.resume_experiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resume_experiences" ON public.resume_experiences FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.resume_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES public.resumes(id) ON DELETE CASCADE,
  skill_name text,
  category text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_skills TO authenticated;
GRANT ALL ON public.resume_skills TO service_role;
ALTER TABLE public.resume_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resume_skills" ON public.resume_skills FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Mídia (prova visual de trabalho)
CREATE TABLE public.work_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_type text CHECK (media_type IN ('photo','video')),
  media_url text NOT NULL,
  category text CHECK (category IN ('agriculture','machinery','animals','general')),
  caption text,
  is_featured boolean DEFAULT false,
  uploaded_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_media TO authenticated;
GRANT ALL ON public.work_media TO service_role;
ALTER TABLE public.work_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own work_media" ON public.work_media FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Vídeo de apresentação
CREATE TABLE public.intro_video (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  language text DEFAULT 'en',
  duration_seconds int,
  recorded_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intro_video TO authenticated;
GRANT ALL ON public.intro_video TO service_role;
ALTER TABLE public.intro_video ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own intro_video" ON public.intro_video FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Checklist do visto
CREATE TABLE public.visa_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_label text NOT NULL,
  sort_order int DEFAULT 0,
  is_completed boolean DEFAULT false,
  completed_at timestamptz,
  UNIQUE (owner_id, step_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visa_checklist_items TO authenticated;
GRANT ALL ON public.visa_checklist_items TO service_role;
ALTER TABLE public.visa_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own checklist" ON public.visa_checklist_items FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Vagas (compartilhadas via feed do DOL — sem owner)
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_case_number text UNIQUE,
  visa_type text DEFAULT 'H-2A',
  job_title text,
  employer_name text,
  employer_address text,
  worksite_state text,
  worksite_city text,
  wage_offered numeric,
  wage_unit text,
  start_date date,
  end_date date,
  total_openings int,
  recruitment_contact_name text,
  recruitment_email text,
  recruitment_phone text,
  recruitment_website text,
  posted_date date,
  raw_feed_data jsonb,
  imported_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can read jobs" ON public.jobs FOR SELECT TO authenticated USING (true);

-- Empregadores (notas pessoais)
CREATE TABLE public.employers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_name text NOT NULL,
  notes text,
  is_flagged_suspicious boolean DEFAULT false,
  flagged_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (owner_id, employer_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employers TO authenticated;
GRANT ALL ON public.employers TO service_role;
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own employers" ON public.employers FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Candidaturas
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id),
  employer_id uuid REFERENCES public.employers(id),
  resume_id uuid REFERENCES public.resumes(id),
  cover_letter_en text,
  attached_media_ids uuid[] DEFAULT ARRAY[]::uuid[],
  attached_video_id uuid REFERENCES public.intro_video(id),
  contact_method text DEFAULT 'email',
  status text DEFAULT 'sent',
  sent_at timestamptz DEFAULT now(),
  follow_up_due_at timestamptz,
  follow_up_sent_at timestamptz,
  responded_at timestamptz,
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own applications" ON public.applications FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Logs de importação do feed
CREATE TABLE public.feed_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_type text,
  records_imported int,
  run_at timestamptz DEFAULT now(),
  status text,
  error_message text
);
GRANT SELECT ON public.feed_import_logs TO authenticated;
GRANT ALL ON public.feed_import_logs TO service_role;
ALTER TABLE public.feed_import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can read logs" ON public.feed_import_logs FOR SELECT TO authenticated USING (true);

-- Índices úteis
CREATE INDEX idx_jobs_posted_date ON public.jobs (posted_date DESC NULLS LAST);
CREATE INDEX idx_jobs_state ON public.jobs (worksite_state);
CREATE INDEX idx_applications_owner_status ON public.applications (owner_id, status);
CREATE INDEX idx_applications_followup ON public.applications (owner_id, follow_up_due_at) WHERE status = 'sent';
CREATE INDEX idx_work_media_owner_cat ON public.work_media (owner_id, category);

-- Trigger: cria perfil e checklist padrão automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.my_profile (owner_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.visa_checklist_items (owner_id, step_key, step_label, sort_order) VALUES
    (NEW.id, 'hired_by_employer', 'Contratado por um empregador certificado', 1),
    (NEW.id, 'i129_filed', 'Petição I-129 protocolada na USCIS', 2),
    (NEW.id, 'ds160', 'Formulário DS-160 preenchido', 3),
    (NEW.id, 'mrv_paid', 'Taxa MRV paga', 4),
    (NEW.id, 'interview_scheduled', 'Entrevista no consulado agendada', 5),
    (NEW.id, 'interview_done', 'Entrevista realizada', 6),
    (NEW.id, 'visa_issued', 'Visto H-2A emitido', 7)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
