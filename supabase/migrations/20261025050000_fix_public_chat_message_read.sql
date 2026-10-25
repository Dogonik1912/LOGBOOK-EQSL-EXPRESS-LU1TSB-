-- Fix public cross-device message visibility without touching existing messages.
-- Remove SELECT policies that may conflict, plus restrictive ALL policies that
-- would otherwise continue filtering anonymous reads. Preserve moderator DELETE policy.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'community_messages'
      and (cmd = 'SELECT' or (cmd = 'ALL' and permissive = 'RESTRICTIVE'))
  loop
    execute format('drop policy if exists %I on public.community_messages', p.policyname);
  end loop;
end
$$;

alter table public.community_messages enable row level security;
grant select on public.community_messages to anon, authenticated;

create policy "Public can read community messages"
  on public.community_messages
  for select
  to anon, authenticated
  using (true);

-- Keep direct writes blocked; posting continues through the protected RPC.
revoke insert, update, delete on public.community_messages from anon, authenticated;

-- Ensure the table is included in Realtime publication where supported.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'community_messages'
  ) then
    alter publication supabase_realtime add table public.community_messages;
  end if;
exception when insufficient_privilege or undefined_object then
  raise notice 'Realtime publication could not be changed by this migration role; polling remains enabled in the app.';
end
$$;
