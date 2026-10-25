-- Public read for the community chat. Posting is only allowed through the
-- SECURITY DEFINER RPCs in 20261025020000_community_chat_public_sd.sql.
grant select on table public.community_messages to anon, authenticated;
revoke insert on table public.community_messages from anon, authenticated;
alter table public.community_messages alter column user_id drop not null;

drop policy if exists community_messages_public_read on public.community_messages;
create policy community_messages_public_read
  on public.community_messages
  for select
  to anon, authenticated
  using (true);

drop policy if exists community_messages_public_insert on public.community_messages;
