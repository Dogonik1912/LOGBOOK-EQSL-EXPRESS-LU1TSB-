-- LogBook eQSL EXPRESS: authenticated community chat.
-- Run this migration in the Supabase SQL Editor for the project connected to Vercel.

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  callsign text not null check (char_length(callsign) between 3 and 24),
  body text not null check (char_length(body) between 1 and 500),
  reply_to_callsign text,
  created_at timestamptz not null default now()
);

create index if not exists community_messages_created_at_idx on public.community_messages (created_at desc);
alter table public.community_messages enable row level security;
revoke all on public.community_messages from anon;
grant select, insert on public.community_messages to authenticated;

drop policy if exists "Authenticated members can read community messages" on public.community_messages;
create policy "Authenticated members can read community messages" on public.community_messages for select to authenticated using (true);
drop policy if exists "Members can post as themselves" on public.community_messages;
create policy "Members can post as themselves" on public.community_messages for insert to authenticated with check (auth.uid() = user_id and char_length(trim(callsign)) between 3 and 24 and char_length(trim(body)) between 1 and 500);

do $$ begin
  alter publication supabase_realtime add table public.community_messages;
exception when duplicate_object then null;
when undefined_object then raise notice 'Enable Realtime for community_messages in Supabase dashboard.';
end $$;
