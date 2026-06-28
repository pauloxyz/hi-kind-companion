ALTER TABLE public.applications 
  ADD COLUMN IF NOT EXISTS reply_snippet TEXT,
  ADD COLUMN IF NOT EXISTS reply_from TEXT,
  ADD COLUMN IF NOT EXISTS reply_received_at TIMESTAMPTZ;