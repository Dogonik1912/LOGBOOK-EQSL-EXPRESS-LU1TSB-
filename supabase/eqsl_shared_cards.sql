-- Run this once in the Supabase SQL Editor for LogBook eQSL Express.
create table if not exists public.eqsl_shared_cards (
  id text primary key check (length(id) between 6 and 24),
  card jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists eqsl_shared_cards_expires_at_idx
  on public.eqsl_shared_cards (expires_at);

alter table public.eqsl_shared_cards enable row level security;

-- No anon/authenticated policies are intentionally created. Only the server-side
-- service-role key used by the Vercel API may read or write these temporary shares.
