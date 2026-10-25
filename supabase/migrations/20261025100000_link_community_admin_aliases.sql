-- Allow the verified administrator to switch between their two authorized callsign aliases.
-- This intentionally links both registered admin aliases to the same device token.
-- Run once in Supabase SQL Editor.
create or replace function public.link_community_admin_alias(
  p_callsign text,
  p_token uuid,
  p_target_callsign text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor text := upper(trim(coalesce(p_callsign, '')));
  v_target text := upper(trim(coalesce(p_target_callsign, '')));
begin
  if p_token is null
     or v_actor not in ('LU1TSB', 'LU1TSB/4RC978')
     or v_target not in ('LU1TSB', 'LU1TSB/4RC978')
     or v_actor = v_target then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- The current identity must already be verified as an administrator by its token.
  if not exists (
    select 1
      from public.community_call_signs c
      join public.community_moderation_roles r on r.callsign = c.callsign
     where c.callsign = v_actor
       and c.identity_token = p_token
       and r.role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  -- Never claim an unregistered alias or silently promote a non-admin identity.
  if not exists (
    select 1
      from public.community_call_signs c
      join public.community_moderation_roles r on r.callsign = c.callsign
     where c.callsign = v_target
       and r.role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'missing_target');
  end if;

  -- Link the second admin alias to the already-verified device token.
  update public.community_call_signs
     set identity_token = p_token
   where callsign = v_target;

  return jsonb_build_object('ok', true, 'callsign', v_target);
end;
$$;

revoke all on function public.link_community_admin_alias(text, uuid, text) from public;
grant execute on function public.link_community_admin_alias(text, uuid, text) to anon, authenticated;
