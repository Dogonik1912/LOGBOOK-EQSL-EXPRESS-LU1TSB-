-- Administracion segura de spots en vivo.
-- Solo el administrador validado por community_actor_role puede borrar spots.
-- No modifica QSOs locales, eQSL ni mensajes de la comunidad.
create or replace function public.admin_delete_live_qso_spot(
  p_callsign text,
  p_token uuid,
  p_spot_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if coalesce(public.community_actor_role(p_callsign, p_token), '') <> 'admin' then
    raise exception 'Solo el administrador general puede borrar spots.';
  end if;

  delete from public.live_qso_spots where spot_key = p_spot_key;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.admin_delete_all_live_qso_spots(
  p_callsign text,
  p_token uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if coalesce(public.community_actor_role(p_callsign, p_token), '') <> 'admin' then
    raise exception 'Solo el administrador general puede borrar spots.';
  end if;

  delete from public.live_qso_spots;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.admin_delete_live_qso_spot(text, uuid, text) from public;
revoke all on function public.admin_delete_all_live_qso_spots(text, uuid) from public;
grant execute on function public.admin_delete_live_qso_spot(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_delete_all_live_qso_spots(text, uuid) to anon, authenticated;
