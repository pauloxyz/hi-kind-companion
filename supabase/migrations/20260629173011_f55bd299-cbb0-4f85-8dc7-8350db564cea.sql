-- 1) Remove etapa redundante do template e dos usuários existentes
DELETE FROM public.visa_checklist_attachments
  WHERE item_id IN (
    SELECT id FROM public.visa_checklist_items WHERE step_key = 'employer_dol_certified'
  );
DELETE FROM public.visa_checklist_items WHERE step_key = 'employer_dol_certified';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.my_profile (owner_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.visa_checklist_items (owner_id, step_key, step_label, sort_order) VALUES
    (NEW.id, 'hired_by_employer',     'Oferta de trabalho aceita e contrato assinado em português', 20),
    (NEW.id, 'passport_valid_6mo',    'Passaporte válido por 6+ meses após o retorno', 30),
    (NEW.id, 'photo_5x5_white',       'Foto 5×5 cm com fundo branco (DS-160)', 40),
    (NEW.id, 'i129_filed',            'I-797 recebido (aprovação USCIS da petição I-129)', 50),
    (NEW.id, 'ds160',                 'Formulário DS-160 preenchido e enviado', 60),
    (NEW.id, 'mrv_paid',              'Taxa MRV paga (US$ 190)', 70),
    (NEW.id, 'casv_scheduled',        'Coleta biométrica no CASV agendada', 80),
    (NEW.id, 'interview_scheduled',   'Entrevista no consulado agendada', 90),
    (NEW.id, 'interview_done',        'Entrevista consular realizada', 100),
    (NEW.id, 'visa_issued',           'Visto H-2A emitido', 110),
    (NEW.id, 'passport_delivered',    'Passaporte com visto retirado (CGI Federal)', 120)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 2) Tabela de histórico
CREATE TABLE IF NOT EXISTS public.visa_checklist_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  item_id uuid NOT NULL,
  step_key text NOT NULL,
  step_label text NOT NULL,
  action text NOT NULL,
  -- 'completed' | 'reopened' | 'event_at_set' | 'event_at_cleared'
  -- 'due_at_set' | 'due_at_cleared' | 'attachment_added' | 'attachment_removed'
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.visa_checklist_history TO authenticated;
GRANT ALL ON public.visa_checklist_history TO service_role;

ALTER TABLE public.visa_checklist_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visa history read own" ON public.visa_checklist_history;
CREATE POLICY "visa history read own"
  ON public.visa_checklist_history FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "visa history insert own" ON public.visa_checklist_history;
CREATE POLICY "visa history insert own"
  ON public.visa_checklist_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS visa_checklist_history_owner_created_idx
  ON public.visa_checklist_history (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS visa_checklist_history_item_idx
  ON public.visa_checklist_history (item_id, created_at DESC);

-- 3) Trigger: registra mudanças em items (completion + datas)
CREATE OR REPLACE FUNCTION public.log_visa_checklist_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.is_completed,false) IS DISTINCT FROM COALESCE(OLD.is_completed,false) THEN
    INSERT INTO public.visa_checklist_history(owner_id, item_id, step_key, step_label, action, details)
    VALUES (NEW.owner_id, NEW.id, NEW.step_key, NEW.step_label,
            CASE WHEN NEW.is_completed THEN 'completed' ELSE 'reopened' END,
            '{}'::jsonb);
  END IF;

  IF COALESCE(OLD.event_at::text,'') IS DISTINCT FROM COALESCE(NEW.event_at::text,'') THEN
    INSERT INTO public.visa_checklist_history(owner_id, item_id, step_key, step_label, action, details)
    VALUES (NEW.owner_id, NEW.id, NEW.step_key, NEW.step_label,
            CASE WHEN NEW.event_at IS NULL THEN 'event_at_cleared' ELSE 'event_at_set' END,
            jsonb_build_object('from', OLD.event_at, 'to', NEW.event_at));
  END IF;

  IF COALESCE(OLD.due_at::text,'') IS DISTINCT FROM COALESCE(NEW.due_at::text,'') THEN
    INSERT INTO public.visa_checklist_history(owner_id, item_id, step_key, step_label, action, details)
    VALUES (NEW.owner_id, NEW.id, NEW.step_key, NEW.step_label,
            CASE WHEN NEW.due_at IS NULL THEN 'due_at_cleared' ELSE 'due_at_set' END,
            jsonb_build_object('from', OLD.due_at, 'to', NEW.due_at));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_visa_checklist_item_change ON public.visa_checklist_items;
CREATE TRIGGER trg_log_visa_checklist_item_change
AFTER UPDATE ON public.visa_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.log_visa_checklist_item_change();

-- 4) Triggers para anexos
CREATE OR REPLACE FUNCTION public.log_visa_attachment_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE it public.visa_checklist_items;
BEGIN
  SELECT * INTO it FROM public.visa_checklist_items WHERE id = NEW.item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.visa_checklist_history(owner_id, item_id, step_key, step_label, action, details)
  VALUES (NEW.owner_id, NEW.item_id, it.step_key, it.step_label, 'attachment_added',
          jsonb_build_object('file_name', NEW.file_name, 'size_bytes', NEW.size_bytes, 'mime_type', NEW.mime_type));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_visa_attachment_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE it public.visa_checklist_items;
BEGIN
  SELECT * INTO it FROM public.visa_checklist_items WHERE id = OLD.item_id;
  IF NOT FOUND THEN RETURN OLD; END IF;
  INSERT INTO public.visa_checklist_history(owner_id, item_id, step_key, step_label, action, details)
  VALUES (OLD.owner_id, OLD.item_id, it.step_key, it.step_label, 'attachment_removed',
          jsonb_build_object('file_name', OLD.file_name));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_visa_attachment_added ON public.visa_checklist_attachments;
CREATE TRIGGER trg_log_visa_attachment_added
AFTER INSERT ON public.visa_checklist_attachments
FOR EACH ROW EXECUTE FUNCTION public.log_visa_attachment_added();

DROP TRIGGER IF EXISTS trg_log_visa_attachment_removed ON public.visa_checklist_attachments;
CREATE TRIGGER trg_log_visa_attachment_removed
AFTER DELETE ON public.visa_checklist_attachments
FOR EACH ROW EXECUTE FUNCTION public.log_visa_attachment_removed();