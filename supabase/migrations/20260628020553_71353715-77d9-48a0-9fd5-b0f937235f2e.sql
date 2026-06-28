ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS last_reply_check_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_applications_thread ON public.applications (owner_id, gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;