-- LogBook eQSL Express: first migration for the worldwide callsign directory.
-- Run once in the Supabase SQL Editor for the project used by Vercel.
-- Do not expose the service-role key in browser code.

create table if not exists public.eqsl_directory (
  callsign text primary key,
  email text,
  whatsapp text,
  telegram text,
  country text,
  grid text,
  contact_public boolean not null default false,
  contact_updated_at timestamptz,
  activity_count bigint not null default 0 check (activity_count >= 0),
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  constraint eqsl_directory_callsign_format
    check (callsign = upper(trim(callsign)) and callsign ~ '^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(/[A-Z0-9]{1,5})?$')
);

create index if not exists eqsl_directory_public_callsign_idx
  on public.eqsl_directory (callsign) where contact_public = true;
create index if not exists eqsl_directory_active_idx
  on public.eqsl_directory (last_activity_at desc) where activity_count > 0;

-- Only the server API should execute writes. RLS blocks direct anonymous/authenticated access.
alter table public.eqsl_directory enable row level security;
revoke all on table public.eqsl_directory from anon, authenticated;
grant select, insert, update, delete on table public.eqsl_directory to service_role;

-- Atomic activity update prevents lost increments when several actions arrive together.
create or replace function public.record_eqsl_activity(p_callsign text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call text := upper(trim(coalesce(p_callsign, '')));
begin
  if v_call !~ '^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(/[A-Z0-9]{1,5})?$' then
    raise exception 'INVALID_CALLSIGN';
  end if;
  insert into public.eqsl_directory (callsign, activity_count, last_activity_at, contact_public)
  values (v_call, 1, now(), false)
  on conflict (callsign) do update
    set activity_count = public.eqsl_directory.activity_count + 1,
        last_activity_at = now();
end;
$$;

-- Contact publication is an explicit opt-in operation by the station owner in the app.
create or replace function public.publish_eqsl_contact(
  p_callsign text,
  p_email text,
  p_whatsapp text,
  p_telegram text,
  p_country text,
  p_grid text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call text := upper(trim(coalesce(p_callsign, '')));
begin
  if v_call !~ '^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(/[A-Z0-9]{1,5})?$' then
    raise exception 'INVALID_CALLSIGN';
  end if;
  if coalesce(trim(p_email), '') = ''
     and coalesce(trim(p_whatsapp), '') = ''
     and coalesce(trim(p_telegram), '') = '' then
    raise exception 'NO_CONTACT_DETAILS';
  end if;
  insert into public.eqsl_directory
    (callsign, email, whatsapp, telegram, country, grid, contact_public, contact_updated_at, activity_count)
  values
    (v_call, nullif(trim(p_email), ''), nullif(trim(p_whatsapp), ''),
     nullif(trim(p_telegram), ''), nullif(trim(p_country), ''),
     nullif(upper(trim(p_grid)), ''), true, now(), 0)
  on conflict (callsign) do update set
    email = excluded.email,
    whatsapp = excluded.whatsapp,
    telegram = excluded.telegram,
    country = excluded.country,
    grid = excluded.grid,
    contact_public = true,
    contact_updated_at = now();
end;
$$;

revoke all on function public.record_eqsl_activity(text) from public, anon, authenticated;
revoke all on function public.publish_eqsl_contact(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_eqsl_activity(text) to service_role;
grant execute on function public.publish_eqsl_contact(text, text, text, text, text, text) to service_role;
