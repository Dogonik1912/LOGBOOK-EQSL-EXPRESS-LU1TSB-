-- Server-side moderation primitives for the public LogBook community chat.
-- Moderator privileges are bound to a callsign's registered device token, never to client UI state.
create table if not exists public.community_moderation_roles (
  callsign text primary key references public.community_call_signs(callsign) on delete cascade,
  role text not null check (role in ('admin','moderator')),
  granted_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.community_sanctions (
  id uuid primary key default gen_random_uuid(),
  target_callsign text not null,
  sanction_type text not null check (sanction_type in ('silence','block')),
  expires_at timestamptz,
  active boolean not null default true,
  reason text,
  applied_by text not null,
  created_at timestamptz not null default now(),
  reversed_by text,
  reversed_at timestamptz
);
create table if not exists public.community_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_callsign text not null,
  action text not null,
  target_callsign text,
  sanction_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.community_moderation_roles enable row level security;
alter table public.community_sanctions enable row level security;
alter table public.community_moderation_audit enable row level security;
revoke all on public.community_moderation_roles, public.community_sanctions, public.community_moderation_audit from anon, authenticated;

create or replace function public.community_actor_role(p_callsign text, p_token uuid)
returns text language sql security definer set search_path=public,pg_temp as $$
  select r.role from public.community_moderation_roles r
  join public.community_call_signs c on c.callsign=r.callsign
  where c.callsign=upper(trim(p_callsign)) and c.identity_token=p_token
$$;
revoke all on function public.community_actor_role(text,uuid) from public;
grant execute on function public.community_actor_role(text,uuid) to anon, authenticated;

create or replace function public.community_moderation_action(
  p_callsign text, p_token uuid, p_action text,
  p_target_callsign text default null, p_sanction_type text default null,
  p_duration_minutes integer default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor text := upper(trim(coalesce(p_callsign,'')));
  v_target text := upper(trim(coalesce(p_target_callsign,'')));
  v_role text;
  v_sanction public.community_sanctions%rowtype;
begin
  v_role := public.community_actor_role(v_actor,p_token);
  if v_role is null then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_action='appoint_moderator' and v_role <> 'admin' then
    return jsonb_build_object('ok',false,'reason','forbidden');
  end if;
  if p_action in ('silence','block') then
    if p_sanction_type not in ('silence','block') then return jsonb_build_object('ok',false,'reason','invalid'); end if;
    if p_sanction_type='silence' and p_duration_minutes not in (5,60,10080) then return jsonb_build_object('ok',false,'reason','invalid_duration'); end if;
    if v_target='' or v_target=v_actor or not exists(select 1 from public.community_call_signs where callsign=v_target) then
      return jsonb_build_object('ok',false,'reason','invalid_target');
    end if;
    insert into public.community_sanctions(target_callsign,sanction_type,expires_at,reason,applied_by)
    values(v_target,p_sanction_type,
      case when p_sanction_type='block' then null else now()+make_interval(mins=>p_duration_minutes) end,
      nullif(trim(coalesce(p_reason,'')),''),v_actor) returning * into v_sanction;
    insert into public.community_moderation_audit(actor_callsign,action,target_callsign,sanction_id,details)
    values(v_actor,p_sanction_type,v_target,v_sanction.id,jsonb_build_object('duration_minutes',p_duration_minutes,'reason',p_reason));
    return jsonb_build_object('ok',true,'sanction',to_jsonb(v_sanction));
  elsif p_action='delete_message' then
    delete from public.community_messages where id::text=p_reason;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    insert into public.community_moderation_audit(actor_callsign,action,target_callsign,details)
    values(v_actor,p_action,v_target,jsonb_build_object('message_id',p_reason));
    return jsonb_build_object('ok',true);
  elsif p_action='appoint_moderator' then
    if v_target='' or not exists(select 1 from public.community_call_signs where callsign=v_target) then
      return jsonb_build_object('ok',false,'reason','invalid_target');
    end if;
    insert into public.community_moderation_roles(callsign,role,granted_by) values(v_target,'moderator',v_actor)
    on conflict(callsign) do update set role='moderator',granted_by=v_actor,created_at=now();
    insert into public.community_moderation_audit(actor_callsign,action,target_callsign)
    values(v_actor,p_action,v_target);
    return jsonb_build_object('ok',true);
  elsif p_action='reverse_sanction' then
    if v_role <> 'admin' then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
    update public.community_sanctions set active=false,reversed_by=v_actor,reversed_at=now()
      where id::text=p_reason and active=true;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    insert into public.community_moderation_audit(actor_callsign,action,target_callsign,sanction_id)
    values(v_actor,p_action,v_target,p_reason::uuid);
    return jsonb_build_object('ok',true);
  elsif p_action='list_sanctions' then
    if v_role <> 'admin' then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
    return jsonb_build_object('ok',true,'sanctions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.community_sanctions s), '[]'::jsonb));
  elsif p_action='list_audit' then
    if v_role <> 'admin' then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
    return jsonb_build_object('ok',true,'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.community_moderation_audit a), '[]'::jsonb));
  end if;
  return jsonb_build_object('ok',false,'reason','unknown_action');
end $$;
revoke all on function public.community_moderation_action(text,uuid,text,text,text,integer,text) from public;
grant execute on function public.community_moderation_action(text,uuid,text,text,text,integer,text) to anon,authenticated;

create or replace function public.post_community_message(
  p_callsign text, p_token uuid, p_body text, p_reply_to_callsign text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_callsign text := upper(trim(coalesce(p_callsign,'')));
  v_body text := trim(coalesce(p_body,''));
  v_message public.community_messages%rowtype;
begin
  if length(v_body)<1 or length(v_body)>500 then return jsonb_build_object('ok',false,'reason','invalid_message'); end if;
  if not exists(select 1 from public.community_call_signs where callsign=v_callsign and identity_token=p_token) then
    return jsonb_build_object('ok',false,'reason','identity_mismatch');
  end if;
  if exists(select 1 from public.community_sanctions s where s.target_callsign=v_callsign and s.active=true
    and (s.sanction_type='block' or (s.sanction_type='silence' and (s.expires_at is null or s.expires_at>now())))) then
    return jsonb_build_object('ok',false,'reason','sanctioned');
  end if;
  insert into public.community_messages(user_id,callsign,body,reply_to_callsign)
  values(null,v_callsign,v_body,nullif(upper(trim(coalesce(p_reply_to_callsign,''))),'')) returning * into v_message;
  return jsonb_build_object('ok',true,'message',to_jsonb(v_message));
end $$;
revoke all on function public.post_community_message(text,uuid,text,text) from public;
grant execute on function public.post_community_message(text,uuid,text,text) to anon,authenticated;
