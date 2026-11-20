create or replace function public.community_private_messages(p_callsign text,p_token uuid,p_other_callsign text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text:=upper(btrim(coalesce(p_callsign,''))); v_other text:=upper(btrim(coalesce(p_other_callsign,''))); v_result jsonb;
begin
 if not public.community_identity_authorized(v_actor,p_token) then raise exception 'forbidden'; end if;
 if length(v_other)<3 or v_other=v_actor then raise exception 'invalid_recipient'; end if;
 update public.community_private_messages set read_at=now()
 where upper(recipient_callsign)=v_actor and upper(sender_callsign)=v_other and read_at is null;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'sender_callsign',m.sender_callsign,'recipient_callsign',m.recipient_callsign,
  'body',m.body,'created_at',m.created_at,'read_at',m.read_at
 ) order by m.created_at asc),'[]'::jsonb)
 into v_result
 from (
  select id,sender_callsign,recipient_callsign,body,created_at,read_at
  from public.community_private_messages
  where (upper(sender_callsign)=v_actor and upper(recipient_callsign)=v_other)
     or (upper(sender_callsign)=v_other and upper(recipient_callsign)=v_actor)
  order by created_at desc
  limit 200
 ) m;
 return v_result;
end;
$$;

create or replace function public.delete_community_private_message(p_callsign text,p_token uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text:=upper(btrim(coalesce(p_callsign,''))); v_deleted integer:=0;
begin
 if not public.community_identity_authorized(v_actor,p_token) then
  return jsonb_build_object('ok',false,'reason','forbidden');
 end if;
 delete from public.community_private_messages
 where id=p_message_id and upper(sender_callsign)=v_actor;
 get diagnostics v_deleted = row_count;
 return jsonb_build_object('ok',v_deleted=1,'deleted_count',v_deleted,
  'reason',case when v_deleted=1 then null else 'not_found_or_not_owner' end);
end;
$$;
grant execute on function public.community_private_messages(text,uuid,text) to anon,authenticated;
grant execute on function public.delete_community_private_message(text,uuid,uuid) to anon,authenticated;
