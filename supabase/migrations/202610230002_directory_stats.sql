-- Directory statistics endpoint: return aggregate counters without downloading all rows.
create or replace function public.get_eqsl_directory_stats()
returns table(active_users bigint, total_actions bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where activity_count > 0)::bigint,
    coalesce(sum(activity_count), 0)::bigint
  from public.eqsl_directory;
$$;

revoke all on function public.get_eqsl_directory_stats() from public, anon, authenticated;
grant execute on function public.get_eqsl_directory_stats() to service_role;
