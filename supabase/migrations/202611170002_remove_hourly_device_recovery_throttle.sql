-- Remove the one-hour issuance quota from both legitimate recovery flows.
-- Authorization, two-device checks, one active code, single-use redemption and
-- ten-minute expiry remain enforced by the functions.
create or replace function public.admin_issue_community_device_recovery(p_admin_token uuid, p_target_callsign text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_target text := upper(trim(coalesce(p_target_callsign, '')));
  v_authorized_token uuid;
  v_code text;
  v_count integer;
begin
  if p_admin_token is null or coalesce(public.community_actor_role('LU1TSB', p_admin_token), '') <> 'admin' then return jsonb_build_object('ok', false, 'reason', 'not_authorized'); end if;
  if v_target = '' or length(v_target) > 24 then return jsonb_build_object('ok', false, 'reason', 'invalid_callsign'); end if;
  select s.identity_token into v_authorized_token from public.community_call_signs s where upper(btrim(s.callsign)) = v_target for update;
  if v_authorized_token is null then return jsonb_build_object('ok', false, 'reason', 'callsign_not_found'); end if;
  select count(*) into v_count from public.community_call_sign_devices d where upper(btrim(d.callsign)) = v_target;
  if v_count < 1 or v_count > 2 or not exists (select 1 from public.community_call_sign_devices d where upper(btrim(d.callsign)) = v_target and d.identity_token = v_authorized_token) then return jsonb_build_object('ok', false, 'reason', 'device_state'); end if;
  v_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  delete from private.community_device_recovery_challenges c where c.callsign = v_target and c.consumed_at is null;
  insert into private.community_device_recovery_challenges(callsign, authorized_token, code_hash, expires_at)
  values (v_target, v_authorized_token, encode(extensions.digest(v_code || ':' || v_authorized_token::text, 'sha256'), 'hex'), now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'callsign', v_target, 'code', v_code, 'expires_in_seconds', 600);
end;
$function$;

create or replace function public.issue_community_device_recovery(p_callsign text, p_authorized_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_canonical_token uuid;
  v_code text;
  v_count integer;
begin
  if p_authorized_token is null or v_callsign = '' then return jsonb_build_object('ok', false, 'reason', 'not_authorized'); end if;
  select s.identity_token into v_canonical_token from public.community_call_signs s where s.callsign = v_callsign for update;
  if v_canonical_token is null or v_canonical_token <> p_authorized_token or not exists (select 1 from public.community_call_sign_devices d where d.callsign = v_callsign and d.identity_token = p_authorized_token) then return jsonb_build_object('ok', false, 'reason', 'not_authorized'); end if;
  select count(*) into v_count from public.community_call_sign_devices d where d.callsign = v_callsign;
  if v_count < 1 or v_count > 2 then return jsonb_build_object('ok', false, 'reason', 'device_state'); end if;
  v_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  delete from private.community_device_recovery_challenges c where c.callsign = v_callsign and c.consumed_at is null;
  insert into private.community_device_recovery_challenges(callsign, authorized_token, code_hash, expires_at)
  values (v_callsign, p_authorized_token, encode(extensions.digest(v_code || ':' || p_authorized_token::text, 'sha256'), 'hex'), now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_in_seconds', 600);
end;
$function$;
