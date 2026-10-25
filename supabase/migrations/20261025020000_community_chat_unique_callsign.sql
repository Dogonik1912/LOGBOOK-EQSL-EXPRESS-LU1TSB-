-- Public, no-registration chat identities. A callsign is globally unique and bound
-- to a browser-generated token; changing or reusing the callsign is rejected by the database.
create table if not exists public.community_chat_identities (
  callsign text primary key,
  identity_token uuid not null unique,
  created_at timestamptz not null default now(),
  constraint community_chat_callsign_format check (
    callsign = upper(trim(callsign))
    and callsign ~ '^[A-Z0-9][A-Z0-9/-]{1,22}[A-Z0-9]$'
  )
);

alter table public.community_chat_identities enable row level security;
revoke all on table public.community_chat_identities from anon, authenticated;
grant select, insert on table public.community_messages to anon, authenticated;
alter table public.community_messages alter column user_id drop not null;

-- Public messages must go through the RPCs so callers cannot bypass unique SD ownership.
revoke insert on table public.community_messages from anon, authenticated;
drop policy if exists community_messages_public_insert on public.community_messages;

create or replace function public.register_community_callsign(
  p_callsign text,
  p_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_existing_token uuid;
  v_existing_callsign text;
begin
  if length(v_callsign) < 3 or length(v_callsign) > 24
     or v_callsign !~ '^[A-Z0-9][A-Z0-9/-]{1,22}[A-Z0-9]$'
     or p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select callsign into v_existing_callsign
  from public.community_chat_identities
  where identity_token = p_token;

  if v_existing_callsign is not null and v_existing_callsign <> v_callsign then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  select identity_token into v_existing_token
  from public.community_chat_identities
  where callsign = v_callsign;

  if v_existing_token is not null then
    if v_existing_token = p_token then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  begin
    insert into public.community_chat_identities(callsign, identity_token)
    values (v_callsign, p_token);
  exception when unique_violation then
    select identity_token into v_existing_token
    from public.community_chat_identities where callsign = v_callsign;
    if v_existing_token = p_token then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;

  return jsonb_build_object('ok', true, 'callsign', v_callsign);
end;
$$;

create or replace function public.post_community_message(
  p_callsign text,
  p_token uuid,
  p_body text,
  p_reply_to_callsign text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_body text := trim(coalesce(p_body, ''));
  v_message public.community_messages%rowtype;
begin
  if length(v_body) < 1 or length(v_body) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_body');
  end if;

  if not exists (
    select 1 from public.community_chat_identities
    where callsign = v_callsign and identity_token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'identity_not_registered');
  end if;

  insert into public.community_messages(user_id, callsign, body, reply_to_callsign)
  values (null, v_callsign, v_body, nullif(upper(trim(p_reply_to_callsign)), ''))
  returning * into v_message;

  return jsonb_build_object('ok', true, 'message', jsonb_build_object(
    'id', v_message.id,
    'user_id', v_message.user_id,
    'callsign', v_message.callsign,
    'body', v_message.body,
    'reply_to_callsign', v_message.reply_to_callsign,
    'created_at', v_message.created_at
  ));
end;
$$;

revoke all on function public.register_community_callsign(text, uuid) from public;
revoke all on function public.post_community_message(text, uuid, text, text) from public;
grant execute on function public.register_community_callsign(text, uuid) to anon, authenticated;
grant execute on function public.post_community_message(text, uuid, text, text) to anon, authenticated;
