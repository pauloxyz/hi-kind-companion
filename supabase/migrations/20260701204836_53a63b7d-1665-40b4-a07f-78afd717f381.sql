
CREATE TABLE public.stripe_webhook_reprocess_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_row_id uuid NOT NULL REFERENCES public.stripe_webhook_events(id) ON DELETE CASCADE,
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  environment text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('success','error')),
  message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_reprocess_log_event ON public.stripe_webhook_reprocess_log(event_row_id, created_at DESC);
CREATE INDEX idx_stripe_reprocess_log_actor ON public.stripe_webhook_reprocess_log(actor_user_id, created_at DESC);
CREATE INDEX idx_stripe_reprocess_log_created ON public.stripe_webhook_reprocess_log(created_at DESC);

GRANT SELECT ON public.stripe_webhook_reprocess_log TO authenticated;
GRANT ALL ON public.stripe_webhook_reprocess_log TO service_role;

ALTER TABLE public.stripe_webhook_reprocess_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reprocess log"
  ON public.stripe_webhook_reprocess_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
