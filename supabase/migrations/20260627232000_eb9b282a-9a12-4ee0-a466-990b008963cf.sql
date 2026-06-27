create table public.job_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  state text,
  category text,
  min_wage numeric,
  min_match integer,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.job_alerts to authenticated;
grant all on public.job_alerts to service_role;

alter table public.job_alerts enable row level security;

create policy "own_alerts" on public.job_alerts
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create index job_alerts_owner_idx on public.job_alerts(owner_id);