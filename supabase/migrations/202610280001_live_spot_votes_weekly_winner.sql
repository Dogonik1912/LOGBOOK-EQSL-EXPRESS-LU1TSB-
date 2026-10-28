-- Votos únicos por spot y ganador semanal para Live Spot.
-- Ejecutar una vez en Supabase SQL Editor después de desplegar el código.
create table if not exists public.live_qso_spot_votes (
  id bigint generated always as identity primary key,
  spot_key text not null,
  voter_token uuid not null,
  voter_callsign text not null,
  callsign text not null,
  station_callsign text not null,
  qso_date date not null,
  qso_time time not null,
  band text not null,
  frequency text not null,
  mode text not null default '',
  country text,
  created_at timestamptz not null default now(),
  constraint live_qso_spot_votes_once_per_identity unique (spot_key, voter_token)
);
create index if not exists live_qso_spot_votes_week_idx
  on public.live_qso_spot_votes (created_at desc, spot_key);
alter table public.live_qso_spot_votes enable row level security;
revoke all on table public.live_qso_spot_votes from anon, authenticated;

create table if not exists public.live_qso_spot_weekly_winners (
  week_start date primary key,
  spot_key text not null,
  callsign text not null,
  station_callsign text not null,
  qso_date date not null,
  qso_time time not null,
  band text not null,
  frequency text not null,
  mode text not null default '',
  country text,
  votes integer not null,
  published_at timestamptz not null default now()
);
alter table public.live_qso_spot_weekly_winners enable row level security;
drop policy if exists "Public can read weekly live spot winners" on public.live_qso_spot_weekly_winners;
create policy "Public can read weekly live spot winners"
  on public.live_qso_spot_weekly_winners for select to anon, authenticated using (true);
revoke insert, update, delete on public.live_qso_spot_weekly_winners from anon, authenticated;

create or replace function public.vote_live_qso_spot(
  p_callsign text,
  p_token uuid,
  p_spot_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  voter text := upper(trim(coalesce(p_callsign, '')));
  spot public.live_qso_spots%rowtype;
  inserted_id bigint;
begin
  if p_token is null or char_length(voter) not between 3 and 24
     or voter !~ '^[A-Z0-9/.-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_identity');
  end if;

  select * into spot from public.live_qso_spots where spot_key = p_spot_key;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'spot_not_found');
  end if;

  insert into public.live_qso_spot_votes (
    spot_key, voter_token, voter_callsign, callsign, station_callsign,
    qso_date, qso_time, band, frequency, mode, country
  ) values (
    spot.spot_key, p_token, voter, spot.callsign, spot.station_callsign,
    spot.qso_date, spot.qso_time, spot.band, spot.frequency, spot.mode, spot.country
  )
  on conflict (spot_key, voter_token) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return jsonb_build_object('ok', false, 'reason', 'already_voted');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_my_live_spot_votes(p_callsign text, p_token uuid)
returns setof text
language sql
security definer
set search_path = public
as $$
  select v.spot_key
  from public.live_qso_spot_votes v
  where p_token is not null
    and v.voter_token = p_token
    and v.voter_callsign = upper(trim(coalesce(p_callsign, '')));
$$;

-- Guarda el resultado de la semana UTC que acaba de terminar.
-- Es idempotente: cada semana solo puede tener un ganador publicado.
create or replace function public.finalize_previous_live_spot_week()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_week date := date_trunc('week', now() at time zone 'UTC')::date;
  completed_week date := current_week - 7;
  winner_row record;
  saved_row public.live_qso_spot_weekly_winners%rowtype;
begin
  select v.spot_key, v.callsign, v.station_callsign, v.qso_date, v.qso_time,
         v.band, v.frequency, v.mode, v.country, count(*)::integer as votes
    into winner_row
    from public.live_qso_spot_votes v
   where (v.created_at at time zone 'UTC')::date >= completed_week
     and (v.created_at at time zone 'UTC')::date < current_week
   group by v.spot_key, v.callsign, v.station_callsign, v.qso_date, v.qso_time,
            v.band, v.frequency, v.mode, v.country
   order by count(*) desc, min(v.created_at) asc, v.spot_key asc
   limit 1;

  if found then
    insert into public.live_qso_spot_weekly_winners (
      week_start, spot_key, callsign, station_callsign, qso_date, qso_time,
      band, frequency, mode, country, votes
    ) values (
      completed_week, winner_row.spot_key, winner_row.callsign, winner_row.station_callsign,
      winner_row.qso_date, winner_row.qso_time, winner_row.band, winner_row.frequency,
      winner_row.mode, winner_row.country, winner_row.votes
    ) on conflict (week_start) do nothing;
  end if;

  select * into saved_row
    from public.live_qso_spot_weekly_winners
   order by week_start desc limit 1;

  if found then
    return jsonb_build_object(
      'week_start', saved_row.week_start, 'spot_key', saved_row.spot_key,
      'callsign', saved_row.callsign, 'station_callsign', saved_row.station_callsign,
      'qso_date', saved_row.qso_date, 'qso_time', saved_row.qso_time,
      'band', saved_row.band, 'frequency', saved_row.frequency, 'mode', saved_row.mode,
      'country', saved_row.country, 'votes', saved_row.votes, 'published_at', saved_row.published_at
    );
  end if;
  return jsonb_build_object('ok', true, 'winner', null);
end;
$$;

revoke all on function public.vote_live_qso_spot(text, uuid, text) from public;
revoke all on function public.get_my_live_spot_votes(text, uuid) from public;
revoke all on function public.finalize_previous_live_spot_week() from public;
grant execute on function public.vote_live_qso_spot(text, uuid, text) to anon, authenticated;
grant execute on function public.get_my_live_spot_votes(text, uuid) to anon, authenticated;
grant execute on function public.finalize_previous_live_spot_week() to anon, authenticated;
