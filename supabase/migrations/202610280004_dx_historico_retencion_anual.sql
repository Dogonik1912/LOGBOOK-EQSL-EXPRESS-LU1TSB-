-- LogBook eQSL EXPRESS: automatic one-year retention for DX weekly history.
-- Removes ONLY archived weekly winner rows after one year from publication.
-- Does not delete live spots or votes.
CREATE OR REPLACE FUNCTION public.purge_expired_live_qso_spot_weekly_winners()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  removed_count integer;
BEGIN
  DELETE FROM public.live_qso_spot_weekly_winners
  WHERE published_at < now() - interval '1 year';

  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RETURN removed_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_expired_live_qso_spot_weekly_winners() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_live_qso_spot_weekly_winners() FROM anon, authenticated;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname = 'dx-semanal-cierre'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'dx-semanal-cierre',
    '5 0 * * 1',
    'SELECT public.finalize_previous_live_spot_week();'
  );

  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname = 'dx-semanal-historico-limpieza'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'dx-semanal-historico-limpieza',
    '15 0 * * *',
    'SELECT public.purge_expired_live_qso_spot_weekly_winners();'
  );
END;
$$;
