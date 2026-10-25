-- Public visitors must post only through the identity-checking RPC.
-- This prevents bypassing unique SD registration by inserting rows directly.
revoke insert on table public.community_messages from anon;
drop policy if exists community_messages_public_insert on public.community_messages;
