CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.my_profile (owner_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.visa_checklist_items (owner_id, step_key, step_label, sort_order) VALUES
    (NEW.id, 'employer_dol_certified', 'Empregador com certificação DOL (ETA-9142A)', 10),
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
$$;

UPDATE public.visa_checklist_items SET step_label = 'Oferta de trabalho aceita e contrato assinado em português', sort_order = 20  WHERE step_key = 'hired_by_employer';
UPDATE public.visa_checklist_items SET step_label = 'I-797 recebido (aprovação USCIS da petição I-129)',          sort_order = 50  WHERE step_key = 'i129_filed';
UPDATE public.visa_checklist_items SET step_label = 'Formulário DS-160 preenchido e enviado',                    sort_order = 60  WHERE step_key = 'ds160';
UPDATE public.visa_checklist_items SET step_label = 'Taxa MRV paga (US$ 190)',                                   sort_order = 70  WHERE step_key = 'mrv_paid';
UPDATE public.visa_checklist_items SET step_label = 'Entrevista no consulado agendada',                          sort_order = 90  WHERE step_key = 'interview_scheduled';
UPDATE public.visa_checklist_items SET step_label = 'Entrevista consular realizada',                             sort_order = 100 WHERE step_key = 'interview_done';
UPDATE public.visa_checklist_items SET step_label = 'Visto H-2A emitido',                                        sort_order = 110 WHERE step_key = 'visa_issued';

INSERT INTO public.visa_checklist_items (owner_id, step_key, step_label, sort_order)
SELECT u.id, v.step_key, v.step_label, v.sort_order
FROM auth.users u
CROSS JOIN (VALUES
  ('employer_dol_certified', 'Empregador com certificação DOL (ETA-9142A)', 10),
  ('passport_valid_6mo',     'Passaporte válido por 6+ meses após o retorno', 30),
  ('photo_5x5_white',        'Foto 5×5 cm com fundo branco (DS-160)', 40),
  ('casv_scheduled',         'Coleta biométrica no CASV agendada', 80),
  ('passport_delivered',     'Passaporte com visto retirado (CGI Federal)', 120)
) AS v(step_key, step_label, sort_order)
ON CONFLICT (owner_id, step_key) DO NOTHING;