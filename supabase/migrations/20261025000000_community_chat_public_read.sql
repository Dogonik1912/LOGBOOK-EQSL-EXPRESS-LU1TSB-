-- Publicly readable community feed; INSERT remains protected by the existing authenticated policy.
grant select on table public.community_messages to anon, authenticated;
drop policy if exists community_messages_public_read on public.community_messages;
create policy community_messages_public_read
  on public.community_messages
  for select
  to anon, authenticated
  using (true);
