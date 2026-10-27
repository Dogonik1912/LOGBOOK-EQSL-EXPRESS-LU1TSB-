-- LogBook eQSL EXPRESS: spots compartidos para QSOs registrados.
-- Ejecutar una sola vez en Supabase SQL Editor.
create table if not exists public.live_qso_spots (
  spot_key text primary key,
  callsign text not null,
  station_callsign text not null,
  qso_date date not null,
  qso_time time not null,
  band text not null,
  frequency text not null,
  mode text not null default '',
  country text,
  created_at timestamptz not null default now()
);
create index if not exists live_qso_spots_created_at_idx on public.live_qso_spots (created_at desc);
alter table public.live_qso_spots enable row level security;
drop policy if exists "Public can read live QSO spots" on public.live_qso_spots;
create policy "Public can read live QSO spots" on public.live_qso_spots for select to anon, authenticated using (true);
drop policy if exists "Public can add live QSO spots" on public.live_qso_spots;
create policy "Public can add live QSO spots" on public.live_qso_spots for insert to anon, authenticated with check (true);
alter table public.live_qso_spots replica identity full;

-- Habilitar eventos realtime para esta tabla si la publicación existe.
do $$
begin
  alter publication supabase_realtime add table public.live_qso_spots;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'La publicación supabase_realtime no existe; habilitar Realtime desde Supabase Dashboard.';
end $$;
