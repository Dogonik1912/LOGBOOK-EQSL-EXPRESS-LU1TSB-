create or replace function public.delete_community_private_message(p_callsign text,p_token uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text:=upper(btrim(coalesce(p_callsign,'')));
begin
 if not public.community_identity_authorized(v_actor,p_token) then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
 delete from public.community_private_messages where id=p_message_id and upper(btrim(sender_callsign))=v_actor;
 if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
 return jsonb_build_object('ok',true);
end;
$$;
grant execute on function public.delete_community_private_message(text,uuid,uuid) to anon,authenticated;
