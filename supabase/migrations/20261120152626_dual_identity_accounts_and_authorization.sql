-- Dual identities per account; a secondary callsign is never a device.
create table if not exists public.community_accounts (
 account_id uuid primary key default gen_random_uuid(),
 root_callsign text not null unique references public.community_call_signs(callsign) on update cascade on delete restrict,
 created_at timestamptz not null default now()
);
create table if not exists public.community_account_identities (
 callsign text primary key references public.community_call_signs(callsign) on update cascade on delete restrict,
 account_id uuid not null references public.community_accounts(account_id) on delete cascade,
 identity_type text not null check(identity_type in('ham','11m')),
 is_primary boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index if not exists community_account_one_identity_type on public.community_account_identities(account_id,identity_type);
create unique index if not exists community_account_one_primary_identity on public.community_account_identities(account_id) where is_primary;
alter table public.community_accounts enable row level security;
alter table public.community_account_identities enable row level security;
revoke all on public.community_accounts from anon,authenticated;
revoke all on public.community_account_identities from anon,authenticated;

create or replace function public.community_identity_authorized(p_callsign text,p_token uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_token is not null
 and (
  exists(select 1 from public.community_call_sign_devices d where upper(btrim(d.callsign))=upper(btrim(coalesce(p_callsign,''))) and d.identity_token=p_token)
  or exists(select 1 from public.community_call_sign_devices d
   join public.community_account_identities root_i on root_i.callsign=d.callsign and root_i.is_primary
   join public.community_account_identities target_i on target_i.account_id=root_i.account_id
   where d.identity_token=p_token and upper(btrim(target_i.callsign))=upper(btrim(coalesce(p_callsign,''))))
 );
$$;
revoke all on function public.community_identity_authorized(text,uuid) from public,anon,authenticated;

create or replace function public.community_account_identities(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_root text; v_account uuid; v_result jsonb;
begin
 if p_token is null then raise exception 'forbidden'; end if;
 select callsign into v_root from public.community_call_sign_devices where identity_token=p_token limit 1;
 if v_root is null then raise exception 'forbidden'; end if;
 select account_id into v_account from public.community_account_identities where callsign=v_root;
 if v_account is null then
  return jsonb_build_array(jsonb_build_object('callsign',v_root,'identity_type',case when v_root ~ '^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$' then '11m' else 'ham' end,'is_primary',true));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('callsign',callsign,'identity_type',identity_type,'is_primary',is_primary) order by is_primary desc,identity_type),'[]'::jsonb)
 into v_result from public.community_account_identities where account_id=v_account;
 return v_result;
end;
$$;

create or replace function public.link_community_account_identity(p_primary_callsign text,p_token uuid,p_secondary_callsign text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_primary text:=upper(btrim(coalesce(p_primary_callsign,'')));
 v_secondary text:=upper(btrim(coalesce(p_secondary_callsign,'')));
 v_account uuid;
 v_existing text;
 v_division integer;
begin
 if p_token is null or length(v_primary)<3 or length(v_secondary)<4 or length(v_secondary)>24 then
  return jsonb_build_object('ok',false,'reason','invalid_format');
 end if;
 if not exists(select 1 from public.community_call_sign_devices d where d.callsign=v_primary and d.identity_token=p_token) then
  return jsonb_build_object('ok',false,'reason','forbidden');
 end if;
 if v_primary !~ '^[A-Z]{1,3}[0-9][A-Z0-9]{1,7}(/[A-Z0-9]{1,5})?$' then
  return jsonb_build_object('ok',false,'reason','primary_must_be_ham');
 end if;
 if v_secondary !~ '^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$' then
  return jsonb_build_object('ok',false,'reason','invalid_11m_callsign');
 end if;
 v_division:=substring(v_secondary from '^([0-9]{1,3})')::integer;
 if v_division<1 or v_division>999 then
  return jsonb_build_object('ok',false,'reason','invalid_11m_division');
 end if;
 perform pg_advisory_xact_lock(hashtext(v_primary));
 select account_id into v_account from public.community_account_identities
 where callsign=v_primary and identity_type='ham';
 if v_account is null then
  if exists(select 1 from public.community_accounts where root_callsign<>v_primary and root_callsign=v_primary) then
   return jsonb_build_object('ok',false,'reason','account_conflict');
  end if;
  insert into public.community_accounts(root_callsign) values(v_primary)
  on conflict(root_callsign) do update set root_callsign=excluded.root_callsign
  returning account_id into v_account;
  insert into public.community_account_identities(callsign,account_id,identity_type,is_primary)
  values(v_primary,v_account,'ham',true) on conflict(callsign) do nothing;
 end if;
 if exists(select 1 from public.community_account_identities
  where callsign=v_secondary and account_id=v_account and identity_type='11m') then
  return jsonb_build_object('ok',true,'callsign',v_secondary,'already_linked',true);
 end if;
 if exists(select 1 from public.community_call_signs where callsign=v_secondary) then
  return jsonb_build_object('ok',false,'reason','taken');
 end if;
 if exists(select 1 from public.community_account_identities where account_id=v_account and identity_type='11m') then
  return jsonb_build_object('ok',false,'reason','11m_identity_already_linked');
 end if;
 if exists(select 1 from public.community_account_identities where callsign=v_secondary) then
  return jsonb_build_object('ok',false,'reason','taken');
 end if;
 insert into public.community_call_signs(callsign,identity_token) values(v_secondary,gen_random_uuid());
 insert into public.community_account_identities(callsign,account_id,identity_type,is_primary)
 values(v_secondary,v_account,'11m',false);
 return jsonb_build_object('ok',true,'callsign',v_secondary);
exception when unique_violation then
 return jsonb_build_object('ok',false,'reason','taken');
end;
$$;

create or replace function public.post_community_message(p_callsign text,p_token uuid,p_body text,p_reply_to_callsign text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_callsign text:=upper(trim(coalesce(p_callsign,''))); v_body text:=trim(coalesce(p_body,'')); v_message public.community_messages%rowtype;
begin
 if p_token is null or length(v_body)<1 or length(v_body)>500 then return jsonb_build_object('ok',false,'reason','invalid_message'); end if;
 if not public.community_identity_authorized(v_callsign,p_token) then return jsonb_build_object('ok',false,'reason','identity_mismatch'); end if;
 insert into public.community_messages(user_id,callsign,body,reply_to_callsign) values(null,v_callsign,v_body,nullif(upper(trim(coalesce(p_reply_to_callsign,''))),'')) returning * into v_message;
 return jsonb_build_object('ok',true,'message',to_jsonb(v_message));
end;
$$;

create or replace function public.community_private_conversations(p_callsign text,p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text:=upper(btrim(coalesce(p_callsign,''))); v_result jsonb;
begin
 if not public.community_identity_authorized(v_actor,p_token) then raise exception 'forbidden'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('other_callsign',c.other_callsign,'last_body',c.last_body,'last_at',c.last_at,'unread_count',c.unread_count) order by c.last_at desc),'[]'::jsonb)
 into v_result from (
  select case when upper(m.sender_callsign)=v_actor then upper(m.recipient_callsign) else upper(m.sender_callsign) end other_callsign,
   (array_agg(m.body order by m.created_at desc))[1] last_body,max(m.created_at) last_at,
   count(*) filter(where upper(m.recipient_callsign)=v_actor and m.read_at is null) unread_count
  from public.community_private_messages m where upper(m.sender_callsign)=v_actor or upper(m.recipient_callsign)=v_actor
  group by case when upper(m.sender_callsign)=v_actor then upper(m.recipient_callsign) else upper(m.sender_callsign) end
 ) c;
 return v_result;
end;
$$;

create or replace function public.community_private_messages(p_callsign text,p_token uuid,p_other_callsign text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text:=upper(btrim(coalesce(p_callsign,''))); v_other text:=upper(btrim(coalesce(p_other_callsign,''))); v_result jsonb;
begin
 if not public.community_identity_authorized(v_actor,p_token) then raise exception 'forbidden'; end if;
 if length(v_other)<3 or v_other=v_actor then raise exception 'invalid_recipient'; end if;
 update public.community_private_messages set read_at=now() where upper(recipient_callsign)=v_actor and upper(sender_callsign)=v_other and read_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sender_callsign',m.sender_callsign,'recipient_callsign',m.recipient_callsign,'body',m.body,'created_at',m.created_at,'read_at',m.read_at) order by m.created_at asc),'[]'::jsonb)
 into v_result from public.community_private_messages m where (upper(m.sender_callsign)=v_actor and upper(m.recipient_callsign)=v_other) or (upper(m.sender_callsign)=v_other and upper(m.recipient_callsign)=v_actor);
 return v_result;
end;
$$;

create or replace function public.send_community_private_message(p_callsign text,p_token uuid,p_recipient_callsign text,p_body text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sender text:=upper(btrim(coalesce(p_callsign,''))); v_recipient text:=upper(btrim(coalesce(p_recipient_callsign,''))); v_body text:=btrim(coalesce(p_body,'')); v_message public.community_private_messages%rowtype;
begin
 if not public.community_identity_authorized(v_sender,p_token) then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
 if length(v_recipient)<3 or v_recipient=v_sender or not exists(select 1 from public.community_call_signs where callsign=v_recipient) then return jsonb_build_object('ok',false,'reason','recipient_not_found'); end if;
 if length(v_body)<1 or length(v_body)>2000 then return jsonb_build_object('ok',false,'reason','invalid_body'); end if;
 if exists(select 1 from public.community_sanctions s where s.active=true and s.sanction_type='block' and upper(btrim(s.target_callsign)) in(v_sender,v_recipient)) then return jsonb_build_object('ok',false,'reason','blocked'); end if;
 insert into public.community_private_messages(sender_callsign,recipient_callsign,body) values(v_sender,v_recipient,v_body) returning * into v_message;
 return jsonb_build_object('ok',true,'message',jsonb_build_object('id',v_message.id,'sender_callsign',v_message.sender_callsign,'recipient_callsign',v_message.recipient_callsign,'body',v_message.body,'created_at',v_message.created_at,'read_at',v_message.read_at));
end;
$$;

grant execute on function public.community_account_identities(uuid) to anon,authenticated;
grant execute on function public.link_community_account_identity(text,uuid,text) to anon,authenticated;
grant execute on function public.post_community_message(text,uuid,text,text) to anon,authenticated;
grant execute on function public.community_private_conversations(text,uuid) to anon,authenticated;
grant execute on function public.community_private_messages(text,uuid,text) to anon,authenticated;
grant execute on function public.send_community_private_message(text,uuid,text,text) to anon,authenticated;

do $$ declare v_token uuid; begin
 select identity_token into v_token from public.community_call_sign_devices where callsign='LU1TSB' order by created_at limit 1;
 if v_token is not null then perform public.link_community_account_identity('LU1TSB',v_token,'4RC978'); end if;
end $$;
