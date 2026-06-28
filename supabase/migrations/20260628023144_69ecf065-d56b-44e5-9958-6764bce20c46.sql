-- Allow anonymous public read of DOL job listings for SEO landing pages.
-- These records are sourced from public US Department of Labor data.
GRANT SELECT ON public.jobs TO anon;
CREATE POLICY "anon can read jobs" ON public.jobs FOR SELECT TO anon USING (true);