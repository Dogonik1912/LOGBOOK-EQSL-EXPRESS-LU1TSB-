-- LogBok eQSL EXPRESS: public chat without account registration.
-- Run this migration in Supabase SQL Editor. It supersedes the authenticated-only
-- policy from 202610250001_community_chat.sql.

create extension if not exists pgcrypto;

create table if not exists public.community_call_signs (
  callsign text primary key check (callsign = upper(trim(callsign)) and length(callsign) between 3 and 24),
  identity_token uuid not null unique,
  created_at timestamptz not null default now()
);

alter table public.community_messages alter column user_id drop not null;
alter table public.community_messages drop constraint if exists community_messages_user_id_fkey;

create index if not exists community_messages_created_at_idx
  on public.community_messages (created_at desc);

alter table public.community_call_signs enable row level security;
alter table public.community_messages enable row level security;

drop policy if exists "Authenticated members can read community messages" on public.community_messages;
drop policy if exists "Members can post as themselves" on public.community_messages;
drop policy if exists "Public can read community messages" on public.community_messages;
create policy "Public can read community messages"
  on public.community_messages for select to anon, authenticated using (true);

revoke all on public.community_call_signs from anon, authenticated;
revoke insert, update, delete on public.community_messages from anon, authenticated;
grant select on public.community_messages to anon, authenticated;

create or replace function public.register_community_callsign(p_callsign text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_existing_token uuid;
  v_existing_callsign text;
begin
  if p_token is null or length(v_callsign) < 3 or length(v_callsign) > 24
     or v_callsign !~ '^[A-Z0-9/]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select identity_token into v_existing_token
    from public.community_call_signs where callsign = v_callsign;
  if found then
    if v_existing_token = p_token then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  select callsign into v_existing_callsign
    from public.community_call_signs where identity_token = p_token;
  if found and v_existing_callsign <> v_callsign then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  insert into public.community_call_signs (callsign, identity_token)
    values (v_callsign, p_token)
    on conflict do nothing;

  select identity_token into v_existing_token
    from public.community_call_signs where callsign = v_callsign;
  if v_existing_token = p_token then
    return jsonb_build_object('ok', true, 'callsign', v_callsign);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'taken');
end;
$$;

create or replace function public.post_community_message(
  p_callsign text,
  p_token uuid,
  p_body text,
  p_reply_to_callsign text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_body text := trim(coalesce(p_body, ''));
  v_message public.community_messages;
begin
  if length(v_body) < 1 or length(v_body) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_message');
  end if;

  if not exists (
    select 1 from public.community_call_signs
    where callsign = v_callsign and identity_token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'identity_mismatch');
  end if;

  insert into public.community_messages (user_id, callsign, body, reply_to_callsign)
    values (null, v_callsign, v_body, nullif(upper(trim(coalesce(p_reply_to_callsign, ''))), ''))
    returning * into v_message;

  return jsonb_build_object('ok', true, 'message', to_jsonb(v_message));
end;
$$;

revoke all on function public.register_community_callsign(text, uuid) from public;
revoke all on function public.post_community_message(text, uuid, text, text) from public;
grant execute on function public.register_community_callsign(text, uuid) to anon, authenticated;
grant execute on function public.post_community_message(text, uuid, text, text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'community_messages'
  ) then
    alter publication supabase_realtime add table public.community_messages;
  end if;
end
$$;
