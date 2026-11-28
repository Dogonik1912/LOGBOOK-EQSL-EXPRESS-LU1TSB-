-- Expire abandoned PTT queue entries using a heartbeat from the existing 1.5s state poll.
-- A queued device that stops checking in for 120 seconds is removed on the next room action.
ALTER TABLE public.lb_voice_queue
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS lb_voice_queue_room_last_seen_idx
  ON public.lb_voice_queue (room_key, last_seen_at);

COMMENT ON COLUMN public.lb_voice_queue.last_seen_at IS
  'Heartbeat updated by state/request actions; entries without a heartbeat for 120 seconds are abandoned.';

CREATE OR REPLACE FUNCTION public.lb_voice_queue_action(
  p_callsign text,
  p_token uuid,
  p_room text,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_call text := upper(btrim(coalesce(p_callsign,'')));
  v_room text := lower(coalesce(p_room,''));
  v_action text := lower(coalesce(p_action,''));
  v_state public.lb_voice_room_state%rowtype;
  v_next public.lb_voice_queue%rowtype;
  v_position integer := 0;
  v_muted boolean := false;
begin
  if v_room not in ('ham','11m') or v_action not in ('state','request','cancel','release') then
    return jsonb_build_object('ok',false,'reason','invalid_request');
  end if;
  if p_token is null or not public.community_identity_authorized(v_call,p_token) then
    return jsonb_build_object('ok',false,'reason','identity_mismatch');
  end if;
  if exists(select 1 from public.community_sanctions s where s.active and s.sanction_type='block'
    and upper(btrim(s.target_callsign))=v_call) then
    return jsonb_build_object('ok',false,'reason','blocked');
  end if;
  if exists(select 1 from public.community_account_identities i where upper(btrim(i.callsign))=v_call) then
    if not exists(select 1 from public.community_account_identities i where upper(btrim(i.callsign))=v_call and i.identity_type=v_room) then
      return jsonb_build_object('ok',false,'reason','wrong_room');
    end if;
  elsif (v_room='11m') <> (v_call ~ '^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$') then
    return jsonb_build_object('ok',false,'reason','wrong_room');
  end if;

  select exists(select 1 from public.lb_voice_mutes m where m.room_key=v_room
    and m.callsign=v_call and m.expires_at>now()) into v_muted;
  if v_action='request' and v_muted then
    return jsonb_build_object('ok',false,'reason','muted');
  end if;

  insert into public.lb_voice_room_state(room_key) values(v_room) on conflict do nothing;
  select * into v_state from public.lb_voice_room_state where room_key=v_room for update;

  -- Remove abandoned waiters before deciding whether the room has a queue.
  delete from public.lb_voice_queue q
    where q.room_key=v_room
      and q.last_seen_at < now()-interval '120 seconds';

  -- A live waiter refreshes its heartbeat without changing its FIFO position.
  if v_action='state' then
    update public.lb_voice_queue
      set last_seen_at=now()
      where room_key=v_room and device_token=p_token;
  end if;

  -- A naturally expired transmission opens the courtesy window only when nobody is queued.
  if v_state.active_token is not null and (v_state.active_until is null or v_state.active_until <= now()) then
    update public.lb_voice_room_state
      set active_callsign=null, active_token=null, active_until=null,
          courtesy_until=case when exists(
            select 1 from public.lb_voice_queue q where q.room_key=v_room
          ) then null else now()+interval '4 seconds' end,
          updated_at=now()
      where room_key=v_room returning * into v_state;
  end if;

  if v_action='request' then
    if v_state.active_token=p_token then
      return jsonb_build_object('ok',true,'status','transmitting',
        'active_callsign',v_state.active_callsign,'active_until',v_state.active_until,
        'courtesy_until',v_state.courtesy_until);
    end if;
    insert into public.lb_voice_queue(room_key,callsign,device_token,last_seen_at)
      values(v_room,v_call,p_token,now())
      on conflict(room_key,device_token) do update set last_seen_at=now();
  elsif v_action='cancel' then
    delete from public.lb_voice_queue where room_key=v_room and device_token=p_token;
  elsif v_action='release' then
    if v_state.active_token=p_token then
      update public.lb_voice_room_state
        set active_callsign=null, active_token=null, active_until=null,
            courtesy_until=case when exists(
              select 1 from public.lb_voice_queue q where q.room_key=v_room and q.device_token<>p_token
            ) then null else now()+interval '4 seconds' end,
            updated_at=now()
        where room_key=v_room returning * into v_state;
    end if;
    delete from public.lb_voice_queue where room_key=v_room and device_token=p_token;
  end if;

  -- Existing waiters take precedence; otherwise respect the four-second courtesy interval.
  if v_state.active_token is null
     and (v_state.courtesy_until is null or v_state.courtesy_until <= now()) then
    loop
      select q.* into v_next from public.lb_voice_queue q
      where q.room_key=v_room
        and not exists(select 1 from public.lb_voice_mutes m
          where m.room_key=v_room and m.callsign=q.callsign and m.expires_at>now())
      order by q.requested_at,q.id limit 1 for update skip locked;
      exit when not found;
      delete from public.lb_voice_queue where id=v_next.id;
      if public.community_identity_authorized(v_next.callsign,v_next.device_token) then
        update public.lb_voice_room_state
          set active_callsign=v_next.callsign, active_token=v_next.device_token,
              active_until=now()+interval '30 seconds', courtesy_until=null, updated_at=now()
          where room_key=v_room returning * into v_state;
        exit;
      end if;
    end loop;
  end if;

  select count(*)::integer into v_position from public.lb_voice_queue q
  where q.room_key=v_room and (q.requested_at,q.id) <= (
    select x.requested_at,x.id from public.lb_voice_queue x
    where x.room_key=v_room and x.device_token=p_token limit 1
  );

  return jsonb_build_object(
    'ok',true,
    'status',case when v_state.active_token=p_token then 'transmitting'
      when exists(select 1 from public.lb_voice_queue where room_key=v_room and device_token=p_token) then 'queued'
      else 'listening' end,
    'active_callsign',v_state.active_callsign,
    'active_until',v_state.active_until,
    'courtesy_until',v_state.courtesy_until,
    'queue_position',case when exists(select 1 from public.lb_voice_queue where room_key=v_room and device_token=p_token) then v_position else 0 end,
    'queue',coalesce((select jsonb_agg(jsonb_build_object('callsign',q.callsign,'requested_at',q.requested_at) order by q.requested_at,q.id)
      from public.lb_voice_queue q where q.room_key=v_room),'[]'::jsonb)
  );
end;
$function$;
