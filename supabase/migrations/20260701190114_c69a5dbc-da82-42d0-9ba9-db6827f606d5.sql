
DELETE FROM public.subscriptions WHERE stripe_checkout_session_id LIKE 'cs_test_e2e_%';
DELETE FROM public.stripe_webhook_events WHERE stripe_event_id LIKE 'evt_test_e2e_%';
