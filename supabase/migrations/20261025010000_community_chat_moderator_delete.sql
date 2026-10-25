-- Only trusted Supabase app_metadata roles can delete community messages.
-- Set app_metadata.role to "admin" or "moderator" (or app_metadata.roles array)
-- for the trusted accounts in Supabase Auth. User-editable user_metadata is not trusted.
grant delete on table public.community_messages to authenticated;

drop policy if exists community_messages_moderator_delete on public.community_messages;
create policy community_messages_moderator_delete
  on public.community_messages
  for delete
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'moderator')
    or coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb) ?| array['admin', 'moderator']
  );
