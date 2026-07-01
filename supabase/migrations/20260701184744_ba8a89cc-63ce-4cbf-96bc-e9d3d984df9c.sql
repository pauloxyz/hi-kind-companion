-- 1) Add environment column (sandbox|live) to separate test vs real payments
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_environment_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_environment_check
  CHECK (environment IN ('sandbox','live'));

-- 2) One-time payments (Stripe Checkout `mode=payment`) don't create a
--    subscription, so stripe_subscription_id would collide on the unique
--    index if we upserted with NULL. Track them by session id instead.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_checkout_session_id_key
  ON public.subscriptions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_user_env_idx
  ON public.subscriptions(user_id, environment);

-- 3) Make is_pro() env-agnostic (any active row across sandbox/live counts).
--    This matches current behavior and doesn't break sandbox testing.
--    Existing rows without a set env default to 'sandbox' (harmless — is_pro
--    doesn't filter by env, and admins bypass everything).