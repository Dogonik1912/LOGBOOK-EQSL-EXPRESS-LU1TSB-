-- Public chat anti-spam hardening.
-- Apply this migration manually in the intended Supabase project after reviewing it.
-- It does not require account registration and does not change message visibility.
-- Limits are per registered callsign; IP-level limits require a trusted server/edge layer.

create or replace function public.post_community_message(
  p_callsign text,
  p_token uuid,
  p_body text,
  p_reply_to_callsign text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_body text := trim(coalesce(p_body, ''));
  v_reply_to text := nullif(upper(trim(coalesce(p_reply_to_callsign, ''))), '');
  v_message public.community_messages%rowtype;
begin
  if p_token is null
     or length(v_callsign) < 3
     or length(v_callsign) > 24
     or v_callsign !~ '^[A-Z0-9/]+$'
     or length(v_body) < 1
     or length(v_body) > 500
     or length(coalesce(v_reply_to, '')) > 24 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_message');
  end if;

  if not exists (
    select 1
      from public.community_call_signs
     where callsign = v_callsign
       and identity_token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'identity_mismatch');
  end if;

  -- Serialize sends for a callsign to prevent simultaneous requests bypassing limits.
  perform pg_advisory_xact_lock(hashtextextended(v_callsign, 0));

  if exists (
    select 1
      from public.community_messages
     where callsign = v_callsign
       and created_at > now() - interval '2 seconds'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited', 'retry_after_seconds', 2);
  end if;

  if (
    select count(*)
      from public.community_messages
     where callsign = v_callsign
       and created_at > now() - interval '1 hour'
  ) >= 120 then
    return jsonb_build_object('ok', false, 'reason', 'hourly_limit', 'retry_after_seconds', 3600);
  end if;

  if exists (
    select 1
      from public.community_sanctions s
     where s.target_callsign = v_callsign
       and s.active = true
       and (
         s.sanction_type = 'block'
         or (s.sanction_type = 'silence' and (s.expires_at is null or s.expires_at > now()))
       )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'sanctioned');
  end if;

  insert into public.community_messages(user_id, callsign, body, reply_to_callsign)
  values (null, v_callsign, v_body, v_reply_to)
  returning * into v_message;

  return jsonb_build_object('ok', true, 'message', to_jsonb(v_message));
end;
$$;

revoke all on function public.post_community_message(text, uuid, text, text) from public;
grant execute on function public.post_community_message(text, uuid, text, text) to anon, authenticated;
