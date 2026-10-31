-- LogBook eQSL EXPRESS: accept only structured amateur-radio callsigns or valid 11m division IDs.
-- Existing identities are preserved; this rule applies only to new registrations.

create or replace function public.register_community_callsign(
  p_callsign text,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_existing_token uuid;
  v_existing_callsign text;
  v_division integer;
  v_valid_11m boolean := false;
  v_valid_ham boolean := false;
begin
  if p_token is null or length(v_callsign) < 3 or length(v_callsign) > 24 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_format');
  end if;

  -- 11m: one-to-three digit division (1..99), letters, then station digits.
  if v_callsign ~ '^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$' then
    v_division := substring(v_callsign from '^([0-9]{1,3})')::integer;
    v_valid_11m := v_division between 1 and 99;
  end if;

  -- Amateur radio: structured prefix + numeric area digit + alphabetic suffix.
  -- Optional portable suffix is accepted, e.g. LU1TSB/P.
  v_valid_ham := v_callsign ~ '^[A-Z0-9]{1,3}[0-9][A-Z]{1,4}(/[A-Z0-9]{1,4})?$';

  if not (v_valid_11m or v_valid_ham) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_format');
  end if;

  select callsign into v_existing_callsign
  from public.community_call_signs
  where identity_token = p_token
  limit 1;

  if v_existing_callsign is not null then
    if upper(v_existing_callsign) = v_callsign then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  select identity_token into v_existing_token
  from public.community_call_signs
  where upper(callsign) = v_callsign
  limit 1;

  if v_existing_token is not null then
    if v_existing_token = p_token then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  begin
    insert into public.community_call_signs(callsign, identity_token)
    values (v_callsign, p_token);
  exception when unique_violation then
    select identity_token into v_existing_token
    from public.community_call_signs
    where upper(callsign) = v_callsign
    limit 1;
    if v_existing_token = p_token then
      return jsonb_build_object('ok', true, 'callsign', v_callsign);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;

  return jsonb_build_object('ok', true, 'callsign', v_callsign);
end;
$$;

revoke all on function public.register_community_callsign(text, uuid) from public;
grant execute on function public.register_community_callsign(text, uuid) to anon, authenticated;
