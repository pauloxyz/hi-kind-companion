-- 1) Datas por etapa do checklist (lembretes e histórico)
ALTER TABLE public.visa_checklist_items
  ADD COLUMN IF NOT EXISTS event_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_at   timestamptz;

COMMENT ON COLUMN public.visa_checklist_items.event_at IS 'Quando a etapa aconteceu (ex.: dia da entrevista, dia que pagou MRV).';
COMMENT ON COLUMN public.visa_checklist_items.due_at   IS 'Lembrete: prazo ou data agendada futura para esta etapa.';

CREATE INDEX IF NOT EXISTS idx_visa_items_due_at
  ON public.visa_checklist_items (owner_id, due_at)
  WHERE due_at IS NOT NULL AND is_completed = false;

-- 2) Anexos (evidências) por etapa do checklist
CREATE TABLE IF NOT EXISTS public.visa_checklist_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES public.visa_checklist_items(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visa_checklist_attachments TO authenticated;
GRANT ALL ON public.visa_checklist_attachments TO service_role;

ALTER TABLE public.visa_checklist_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own attachments"
  ON public.visa_checklist_attachments
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_visa_attachments_item
  ON public.visa_checklist_attachments (item_id);
CREATE INDEX IF NOT EXISTS idx_visa_attachments_owner
  ON public.visa_checklist_attachments (owner_id, created_at DESC);