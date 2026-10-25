-- Fix admin callsign switching when identity_token has a UNIQUE constraint.
-- Run this SQL once in Supabase SQL Editor for the LogBook project.
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
     or v_actor not in ('LU1TSB', '4RC978', 'LU1TSB/4RC978')
     or v_target not in ('LU1TSB', '4RC978', 'LU1TSB/4RC978')
     or v_actor = v_target then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

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

  if not exists (
    select 1
      from public.community_call_signs c
      join public.community_moderation_roles r on r.callsign = c.callsign
     where c.callsign = v_target
       and r.role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'missing_target');
  end if;

  -- Move the current row to a fresh token first so the UNIQUE token index
  -- remains valid while the target alias takes over this device's token.
  update public.community_call_signs
     set identity_token = gen_random_uuid()
   where callsign = v_actor
     and identity_token = p_token;

  update public.community_call_signs
     set identity_token = p_token
   where callsign = v_target;

  return jsonb_build_object('ok', true, 'callsign', v_target);
end;
$$;

revoke all on function public.link_community_admin_alias(text, uuid, text) from public;
grant execute on function public.link_community_admin_alias(text, uuid, text) to anon, authenticated;


-- Recover this device's registered callsign when local storage has lost the label.
create or replace function public.resolve_community_callsign(p_token uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select c.callsign
    from public.community_call_signs c
   where p_token is not null
     and c.identity_token = p_token
   limit 1;
$$;

revoke all on function public.resolve_community_callsign(uuid) from public;
grant execute on function public.resolve_community_callsign(uuid) to anon, authenticated;

-- Keep the three creator identities as administrator accounts.
insert into public.community_call_signs (callsign, identity_token)
values ('4RC978', gen_random_uuid())
on conflict (callsign) do nothing;

insert into public.community_moderation_roles (callsign, role)
values ('LU1TSB', 'admin'), ('4RC978', 'admin'), ('LU1TSB/4RC978', 'admin')
on conflict (callsign) do update set role = excluded.role;
