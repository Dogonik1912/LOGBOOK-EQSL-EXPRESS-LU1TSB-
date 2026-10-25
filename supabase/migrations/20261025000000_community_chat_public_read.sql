-- Public read and no-registration posting for the community chat.
-- Anonymous messages use a NULL user_id; no email or authenticated session is required.
grant select, insert on table public.community_messages to anon, authenticated;
alter table public.community_messages alter column user_id drop not null;

drop policy if exists community_messages_public_read on public.community_messages;
create policy community_messages_public_read
  on public.community_messages
  for select
  to anon, authenticated
  using (true);

drop policy if exists community_messages_public_insert on public.community_messages;
create policy community_messages_public_insert
  on public.community_messages
  for insert
  to anon, authenticated
  with check (
    char_length(trim(callsign)) between 3 and 24
    and char_length(trim(body)) between 1 and 500
    and (user_id is null or user_id = auth.uid())
  );
