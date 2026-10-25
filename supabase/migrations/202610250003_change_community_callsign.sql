-- LogBok eQSL EXPRESS: allow a device to correct its own community-chat callsign.
-- Run once in Supabase SQL Editor after 202610250002_public_device_chat.sql.
-- eQSL station/recipient callsigns are separate app fields and are not changed by this function.

create or replace function public.change_community_callsign(
  p_current_callsign text,
  p_new_callsign text,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current text := upper(trim(coalesce(p_current_callsign, '')));
  v_new text := upper(trim(coalesce(p_new_callsign, '')));
begin
  if p_token is null
     or length(v_current) < 3 or length(v_current) > 24
     or length(v_new) < 3 or length(v_new) > 24
     or v_new !~ '^[A-Z0-9/]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- The browser's existing device token must prove ownership of the current callsign.
  if not exists (
    select 1 from public.community_call_signs
    where callsign = v_current and identity_token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'identity_mismatch');
  end if;

  if v_current = v_new then
    return jsonb_build_object('ok', true, 'callsign', v_new);
  end if;

  if exists (
    select 1 from public.community_call_signs
    where callsign = v_new and identity_token <> p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  update public.community_call_signs
     set callsign = v_new
   where callsign = v_current and identity_token = p_token;

  return jsonb_build_object('ok', true, 'callsign', v_new);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
end;
$$;

revoke all on function public.change_community_callsign(text, text, uuid) from public;
grant execute on function public.change_community_callsign(text, text, uuid) to anon, authenticated;
