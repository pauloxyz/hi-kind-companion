
CREATE TABLE public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  status text NOT NULL CHECK (status IN ('processed','ignored','error')),
  error_message text,
  payload_summary jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT stripe_webhook_events_event_env_unique UNIQUE (stripe_event_id, environment)
);

CREATE INDEX idx_stripe_webhook_events_type ON public.stripe_webhook_events (event_type, received_at DESC);
CREATE INDEX idx_stripe_webhook_events_env_status ON public.stripe_webhook_events (environment, status, received_at DESC);

GRANT SELECT ON public.stripe_webhook_events TO authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view stripe webhook events"
  ON public.stripe_webhook_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
