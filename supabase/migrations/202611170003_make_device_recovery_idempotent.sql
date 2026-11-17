create or replace function public.redeem_community_device_recovery(p_callsign text, p_code text, p_new_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_code text := upper(trim(coalesce(p_code, '')));
  v_canonical_token uuid;
  v_challenge private.community_device_recovery_challenges%rowtype;
  v_count integer;
begin
  if p_new_token is null or v_callsign = '' or v_code !~ '^[A-F0-9]{8}$' then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  select s.identity_token into v_canonical_token from public.community_call_signs s where s.callsign = v_callsign for update;
  if v_canonical_token is null or p_new_token = v_canonical_token then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  -- A retry from the same device is successful even after the one-time code was consumed.
  if exists (select 1 from public.community_call_sign_devices d where upper(btrim(d.callsign)) = v_callsign and d.identity_token = p_new_token) then
    return jsonb_build_object('ok', true, 'callsign', v_callsign, 'already_registered', true);
  end if;
  if exists (select 1 from public.community_call_sign_devices d where d.identity_token = p_new_token and upper(btrim(d.callsign)) <> v_callsign) then
    return jsonb_build_object('ok', false, 'reason', 'device_in_use');
  end if;
  select c.* into v_challenge from private.community_device_recovery_challenges c
  where c.callsign = v_callsign and c.consumed_at is null order by c.created_at desc limit 1 for update;
  if not found or v_challenge.expires_at <= now() or v_challenge.attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'expired_or_invalid'); end if;
  if v_challenge.authorized_token <> v_canonical_token or v_challenge.code_hash <> encode(extensions.digest(v_code || ':' || v_challenge.authorized_token::text, 'sha256'), 'hex') then
    update private.community_device_recovery_challenges set attempts = attempts + 1 where id = v_challenge.id;
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  select count(*) into v_count from public.community_call_sign_devices d where upper(btrim(d.callsign)) = v_callsign;
  if v_count < 1 or v_count > 2 then return jsonb_build_object('ok', false, 'reason', 'device_state'); end if;
  update private.community_device_recovery_challenges set consumed_at = now() where id = v_challenge.id;
  delete from public.community_call_sign_devices d where upper(btrim(d.callsign)) = v_callsign and d.identity_token <> v_canonical_token;
  insert into public.community_call_sign_devices(callsign, identity_token) values (v_callsign, p_new_token) on conflict (callsign, identity_token) do nothing;
  return jsonb_build_object('ok', true, 'callsign', v_callsign);
end;
$function$;
