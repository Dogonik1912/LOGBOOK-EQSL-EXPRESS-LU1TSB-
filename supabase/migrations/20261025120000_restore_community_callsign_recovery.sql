-- Restore callsign recovery for already-linked anonymous chat devices.
-- This function only looks up an existing token-to-callsign association.
-- It does not create, change, or delete identities.
create or replace function public.resolve_community_callsign(p_token uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.callsign
  from public.community_call_signs as c
  where p_token is not null
    and c.identity_token = p_token
  limit 1;
$$;

revoke all on function public.resolve_community_callsign(uuid) from public;
grant execute on function public.resolve_community_callsign(uuid) to anon, authenticated;
