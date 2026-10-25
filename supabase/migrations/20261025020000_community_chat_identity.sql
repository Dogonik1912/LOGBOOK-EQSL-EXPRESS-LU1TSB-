-- Unique, immutable community callsigns (SD) for anonymous chat visitors.
-- The browser-generated token is an anonymous installation identity, not an account or login.
create table if not exists public.community_chat_identities (
  id uuid primary key default gen_random_uuid(),
  callsign text not null,
  identity_token uuid not null,
  created_at timestamptz not null default now(),
  constraint community_chat_identities_callsign_unique unique (callsign),
  constraint community_chat_identities_token_unique unique (identity_token),
  constraint community_chat_identities_callsign_length check (char_length(callsign) between 3 and 24)
);

alter table public.community_chat_identities enable row level security;
revoke all on table public.community_chat_identities from anon, authenticated;

create or replace function public.register_community_callsign(p_callsign text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := upper(trim(coalesce(p_callsign, '')));
  existing public.community_chat_identities%rowtype;
begin
  if p_token is null or char_length(normalized) not between 3 and 24
     or normalized !~ '^[A-Z0-9/.-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into existing
  from public.community_chat_identities
  where identity_token = p_token;

  if found then
    if existing.callsign = normalized then
      return jsonb_build_object('ok', true, 'callsign', existing.callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  insert into public.community_chat_identities(callsign, identity_token)
  values (normalized, p_token)
  on conflict do nothing;

  if not found then
    -- Re-read to distinguish a retry from a callsign already owned by another visitor.
    select * into existing from public.community_chat_identities where identity_token = p_token;
    if found and existing.callsign = normalized then
      return jsonb_build_object('ok', true, 'callsign', existing.callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  return jsonb_build_object('ok', true, 'callsign', normalized);
exception when unique_violation then
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
set search_path = public
as $$
declare
  normalized text := upper(trim(coalesce(p_callsign, '')));
  message_row public.community_messages%rowtype;
begin
  if p_token is null or char_length(trim(coalesce(p_body, ''))) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if not exists (
    select 1 from public.community_chat_identities
    where identity_token = p_token and callsign = normalized
  ) then
    return jsonb_build_object('ok', false, 'reason', 'identity_not_registered');
  end if;

  insert into public.community_messages(user_id, callsign, body, reply_to_callsign)
  values (null, normalized, trim(p_body), nullif(upper(trim(coalesce(p_reply_to_callsign, ''))), ''))
  returning * into message_row;

  return jsonb_build_object('ok', true, 'message', jsonb_build_object(
    'id', message_row.id,
    'user_id', message_row.user_id,
    'callsign', message_row.callsign,
    'body', message_row.body,
    'reply_to_callsign', message_row.reply_to_callsign,
    'created_at', message_row.created_at
  ));
end;
$$;

revoke all on function public.register_community_callsign(text, uuid) from public;
revoke all on function public.post_community_message(text, uuid, text, text) from public;
grant execute on function public.register_community_callsign(text, uuid) to anon, authenticated;
grant execute on function public.post_community_message(text, uuid, text, text) to anon, authenticated;
