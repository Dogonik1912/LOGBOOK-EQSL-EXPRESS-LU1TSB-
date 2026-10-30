-- LogBook eQSL EXPRESS: safe reconciliation of historical installation identities.
-- Additive only: no chat/private messages are deleted and no callsign/token is reassigned.
-- Conflicting legacy ownership is quarantined for manual review.
begin;

create table if not exists public.community_identity_reconciliation_conflicts (
  id bigint generated always as identity primary key,
  callsign text not null,
  conflict_reason text not null check (conflict_reason in (
    'callsign_owned_by_different_token',
    'token_bound_to_different_callsign',
    'legacy_callsign_format_not_supported'
  )),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.community_identity_reconciliation_conflicts enable row level security;
revoke all on public.community_identity_reconciliation_conflicts from public, anon, authenticated;

do $$
declare
  r record;
  v_call_token uuid;
  v_token_call text;
  v_reason text;
begin
  if to_regclass('public.community_chat_identities') is null
     or to_regclass('public.community_call_signs') is null then
    raise exception 'Identity tables missing; transaction cancelled without changes.';
  end if;

  for r in execute
    'select upper(trim(callsign)) as callsign, identity_token
       from public.community_chat_identities
      where identity_token is not null
      order by created_at nulls first'
  loop
    select identity_token into v_call_token
      from public.community_call_signs where callsign = r.callsign;
    select callsign into v_token_call
      from public.community_call_signs where identity_token = r.identity_token;

    if r.callsign !~ '^[A-Z0-9/]{3,24}$' then
      v_reason := 'legacy_callsign_format_not_supported';
    elsif (v_call_token is null or v_call_token = r.identity_token)
       and (v_token_call is null or v_token_call = r.callsign) then
      insert into public.community_call_signs(callsign, identity_token)
      values (r.callsign, r.identity_token)
      on conflict do nothing;
    else
      v_reason := case
        when v_call_token is not null and v_call_token <> r.identity_token
          then 'callsign_owned_by_different_token'
        else 'token_bound_to_different_callsign'
      end;
    end if;

    if v_reason is not null then
      insert into public.community_identity_reconciliation_conflicts(callsign, conflict_reason)
      select r.callsign, v_reason
      where not exists (
        select 1 from public.community_identity_reconciliation_conflicts c
        where c.callsign = r.callsign
          and c.conflict_reason = v_reason
          and c.resolved_at is null
      );
    end if;
    v_reason := null;
  end loop;
end
$$;

-- Resolve only when canonical and legacy records agree; never guess between owners.
create or replace function public.resolve_community_callsign(p_token uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_canonical text;
  v_legacy text;
begin
  if p_token is null then return null; end if;

  select callsign into v_canonical
    from public.community_call_signs where identity_token = p_token;

  if to_regclass('public.community_chat_identities') is not null then
    execute 'select upper(trim(callsign)) from public.community_chat_identities where identity_token = $1'
      into v_legacy using p_token;
  end if;

  if v_canonical is not null and v_legacy is not null and v_canonical <> v_legacy then
    return null;
  end if;
  return coalesce(v_canonical, v_legacy);
end
$$;

-- An exact legacy token/callsign pair is accepted and promoted idempotently.
create or replace function public.register_community_callsign(p_callsign text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_legacy_call text;
  v_legacy_token uuid;
  v_canonical_call text;
  v_canonical_token uuid;
begin
  if p_token is null or length(v_callsign) < 3 or length(v_callsign) > 24
     or v_callsign !~ '^[A-Z0-9/]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if to_regclass('public.community_chat_identities') is not null then
    execute 'select upper(trim(callsign)) from public.community_chat_identities where identity_token = $1'
      into v_legacy_call using p_token;
    execute 'select identity_token from public.community_chat_identities where upper(trim(callsign)) = $1'
      into v_legacy_token using v_callsign;

    if v_legacy_call is not null and v_legacy_call <> v_callsign then
      return jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    if v_legacy_token is not null and v_legacy_token <> p_token then
      return jsonb_build_object('ok', false, 'reason', 'taken');
    end if;
  end if;

  select callsign into v_canonical_call
    from public.community_call_signs where identity_token = p_token;
  select identity_token into v_canonical_token
    from public.community_call_signs where callsign = v_callsign;

  if v_canonical_call is not null or v_canonical_token is not null then
    if v_canonical_call = v_callsign and v_canonical_token = p_token then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    elsif v_canonical_call is not null then
      return jsonb_build_object('ok', false, 'reason', 'locked');
    else
      return jsonb_build_object('ok', false, 'reason', 'taken');
    end if;
  end if;

  insert into public.community_call_signs(callsign, identity_token)
  values (v_callsign, p_token)
  on conflict do nothing;

  if exists (
    select 1 from public.community_call_signs
    where callsign = v_callsign and identity_token = p_token
  ) then
    return jsonb_build_object('ok', true, 'callsign', v_callsign);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'taken');
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'taken');
end
$$;

revoke all on function public.resolve_community_callsign(uuid) from public;
revoke all on function public.register_community_callsign(text, uuid) from public;
grant execute on function public.resolve_community_callsign(uuid) to anon, authenticated;
grant execute on function public.register_community_callsign(text, uuid) to anon, authenticated;

commit;

-- Read-only verification after running:
-- select count(*) as canonical_identities from public.community_call_signs;
-- select callsign, conflict_reason from public.community_identity_reconciliation_conflicts
--   where resolved_at is null order by detected_at;
-- select count(*) as chat_messages from public.community_messages;
-- select count(*) as private_messages from public.community_private_messages;
