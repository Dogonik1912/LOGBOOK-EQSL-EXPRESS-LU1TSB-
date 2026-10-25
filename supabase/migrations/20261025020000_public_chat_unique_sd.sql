create table if not exists public.community_chat_identities (
  callsign text primary key,
  identity_token uuid not null,
  created_at timestamptz not null default now(),
  constraint community_chat_identities_callsign_length check (char_length(callsign) between 3 and 24)
);
alter table public.community_messages alter column user_id drop not null;
grant select on table public.community_messages to anon, authenticated;
alter table public.community_chat_identities enable row level security;
revoke all on table public.community_chat_identities from anon, authenticated;

create or replace function public.register_community_callsign(p_callsign text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_callsign text := upper(trim(p_callsign));
  v_existing_token uuid;
begin
  if v_callsign is null or char_length(v_callsign) not between 3 and 24 or v_callsign !~ '^[A-Z0-9/.-]+$' or p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  insert into public.community_chat_identities(callsign, identity_token) values (v_callsign, p_token) on conflict (callsign) do nothing;
  select identity_token into v_existing_token from public.community_chat_identities where callsign = v_callsign;
  if v_existing_token = p_token then return jsonb_build_object('ok', true, 'callsign', v_callsign); end if;
  return jsonb_build_object('ok', false, 'reason', 'taken');
end;
$$;

create or replace function public.post_community_message(p_callsign text, p_token uuid, p_body text, p_reply_to_callsign text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_callsign text := upper(trim(p_callsign));
  v_body text := trim(p_body);
  v_message public.community_messages;
begin
  if v_callsign is null or p_token is null or char_length(v_body) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not exists (select 1 from public.community_chat_identities i where i.callsign = v_callsign and i.identity_token = p_token) then
    return jsonb_build_object('ok', false, 'reason', 'identity_mismatch');
  end if;
  insert into public.community_messages(user_id, callsign, body, reply_to_callsign)
  values (null, v_callsign, v_body, nullif(upper(trim(p_reply_to_callsign)), ''))
  returning * into v_message;
  return jsonb_build_object('ok', true, 'message', jsonb_build_object(
    'id', v_message.id, 'user_id', v_message.user_id, 'callsign', v_message.callsign,
    'body', v_message.body, 'reply_to_callsign', v_message.reply_to_callsign, 'created_at', v_message.created_at
  ));
end;
$$;
revoke all on function public.register_community_callsign(text, uuid) from public;
revoke all on function public.post_community_message(text, uuid, text, text) from public;
grant execute on function public.register_community_callsign(text, uuid) to anon, authenticated;
grant execute on function public.post_community_message(text, uuid, text, text) to anon, authenticated;
