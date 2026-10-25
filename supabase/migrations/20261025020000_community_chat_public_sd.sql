-- Server-enforced, no-registration community chat identity.
-- A callsign (SD) can be claimed once, and each browser identity token is bound
-- permanently to its first callsign. The registry is not directly readable/writable.
create table if not exists public.community_callsign_registry (
  callsign text primary key,
  identity_token text not null unique,
  created_at timestamptz not null default now(),
  constraint community_callsign_registry_callsign_format
    check (callsign = upper(trim(callsign)) and char_length(callsign) between 3 and 24),
  constraint community_callsign_registry_token_length
    check (char_length(identity_token) between 16 and 100)
);

alter table public.community_callsign_registry enable row level security;
revoke all on table public.community_callsign_registry from anon, authenticated;
grant select on table public.community_messages to anon, authenticated;
revoke insert on table public.community_messages from anon, authenticated;

create or replace function public.register_community_callsign(p_callsign text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_existing_callsign text;
begin
  if char_length(v_callsign) < 3 or char_length(v_callsign) > 24
     or v_callsign !~ '^[A-Z0-9/]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_token is null or char_length(p_token) < 16 or char_length(p_token) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  select r.callsign into v_existing_callsign
    from public.community_callsign_registry r
    where r.identity_token = p_token;
  if found then
    if v_existing_callsign = v_callsign then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  begin
    insert into public.community_callsign_registry(callsign, identity_token)
      values (v_callsign, p_token);
  exception when unique_violation then
    select r.callsign into v_existing_callsign
      from public.community_callsign_registry r
      where r.identity_token = p_token;
    if found and v_existing_callsign = v_callsign then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    elsif found then
      return jsonb_build_object('ok', false, 'reason', 'locked');
    else
      return jsonb_build_object('ok', false, 'reason', 'taken');
    end if;
  end;

  return jsonb_build_object('ok', true, 'callsign', v_callsign);
end;
$$;

create or replace function public.post_community_message(
  p_callsign text,
  p_token text,
  p_body text,
  p_reply_to_callsign text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_body text := trim(coalesce(p_body, ''));
  v_message public.community_messages%rowtype;
begin
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_body');
  end if;

  if not exists (
    select 1 from public.community_callsign_registry r
    where r.callsign = v_callsign and r.identity_token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'identity_not_registered');
  end if;

  insert into public.community_messages(user_id, callsign, body, reply_to_callsign)
    values (null, v_callsign, v_body, nullif(trim(coalesce(p_reply_to_callsign, '')), ''))
    returning * into v_message;

  return jsonb_build_object(
    'ok', true,
    'message', jsonb_build_object(
      'id', v_message.id,
      'user_id', v_message.user_id,
      'callsign', v_message.callsign,
      'body', v_message.body,
      'reply_to_callsign', v_message.reply_to_callsign,
      'created_at', v_message.created_at
    )
  );
end;
$$;

revoke all on function public.register_community_callsign(text, text) from public;
revoke all on function public.post_community_message(text, text, text, text) from public;
grant execute on function public.register_community_callsign(text, text) to anon, authenticated;
grant execute on function public.post_community_message(text, text, text, text) to anon, authenticated;
