
DROP INDEX IF EXISTS public.subscriptions_stripe_checkout_session_id_key;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_stripe_checkout_session_id_key
  UNIQUE (stripe_checkout_session_id);
