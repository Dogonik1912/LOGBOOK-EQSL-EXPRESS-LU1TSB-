create table if not exists public.community_profile_contacts (
  owner_callsign text not null,
  qso_key text not null,
  remote_callsign text not null,
  station_type text not null check (station_type in ('ham','11m')),
  country_name text,
  division text,
  band text not null default '',
  qso_date date not null,
  qso_time time not null,
  created_at timestamptz not null default now(),
  primary key (owner_callsign, qso_key)
);
create index if not exists community_profile_contacts_owner_type_idx
  on public.community_profile_contacts (owner_callsign, station_type, qso_date desc);
create table if not exists public.community_profile_eqsl_gallery (
  recipient_callsign text not null,
  sender_callsign text not null,
  station_type text not null check (station_type in ('ham','11m')),
  source_share_id text not null,
  card jsonb not null check (jsonb_typeof(card) = 'object'),
  received_at timestamptz not null default now(),
  primary key (recipient_callsign, sender_callsign, station_type)
);
create index if not exists community_profile_eqsl_gallery_recipient_type_idx
  on public.community_profile_eqsl_gallery (recipient_callsign, station_type, received_at desc);
alter table public.community_profile_contacts enable row level security;
alter table public.community_profile_eqsl_gallery enable row level security;
revoke all on public.community_profile_contacts from anon, authenticated;
revoke all on public.community_profile_eqsl_gallery from anon, authenticated;
