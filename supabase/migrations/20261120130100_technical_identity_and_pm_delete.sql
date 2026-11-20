create or replace function public.community_identity_authorized(p_callsign text,p_token uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_token is not null and upper(btrim(coalesce(p_callsign,''))) <> 'LU1TSB/4RC978'
 and (
  exists(select 1 from public.community_call_sign_devices d where upper(btrim(d.callsign))=upper(btrim(coalesce(p_callsign,''))) and d.identity_token=p_token)
  or exists(select 1 from public.community_call_sign_devices d join public.community_account_identities root_i on root_i.callsign=d.callsign and root_i.is_primary join public.community_account_identities target_i on target_i.account_id=root_i.account_id where d.identity_token=p_token and upper(btrim(target_i.callsign))=upper(btrim(coalesce(p_callsign,''))))
 );
$$;
revoke all on function public.community_identity_authorized(text,uuid) from public,anon,authenticated;

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
