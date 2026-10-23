-- Run this SQL in the Supabase SQL Editor before enabling the global directory.
create table if not exists public.eqsl_directory (
  callsign text primary key,
  email text,
  whatsapp text,
  country text,
  grid text,
  contact_public boolean not null default false,
  activity_count integer not null default 0 check (activity_count >= 0),
  last_activity_at timestamptz,
  contact_updated_at timestamptz
);
create index if not exists eqsl_directory_active_idx on public.eqsl_directory (activity_count) where activity_count > 0;
alter table public.eqsl_directory enable row level security;
-- No anon/authenticated policies: only the Vercel serverless API uses the service-role key.
-- Never expose SUPABASE_SERVICE_ROLE_KEY in client-side variables.
