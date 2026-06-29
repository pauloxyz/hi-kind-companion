-- Hourly cron: dispatch H-2A checklist reminders (14/7/1 days)
SELECT cron.unschedule('visa-reminder-dispatcher') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='visa-reminder-dispatcher');

SELECT cron.schedule(
  'visa-reminder-dispatcher',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--bfc1be60-9598-46b5-b328-4a163d63ef93.lovable.app/api/public/hooks/visa-reminders',
    headers := jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_wq43mYCRgxQ11IfBOkHi7w_Ihw2O_A3'),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);