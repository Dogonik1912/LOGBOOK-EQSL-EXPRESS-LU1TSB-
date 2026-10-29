-- DX semanal: concurso activo inmediatamente, votación con identidad compartida
-- verificada, premio/ganador automático y limpieza de spots cada domingo 00:00 UTC.
-- No borra QSO, eQSL, mensajes ni votos históricos.

-- El concurso semanal se activa inmediatamente, sin mínimo de participantes.
DROP TRIGGER IF EXISTS activate_dx_weekly_at_100_users ON public.community_call_signs;
UPDATE public.live_qso_spot_contest_settings
   SET contest_started_at = COALESCE(contest_started_at, now()),
       required_users = 0,
       updated_at = now()
 WHERE singleton = true;

-- Compatibilidad con la tabla de votos creada por migraciones previas.
ALTER TABLE public.live_qso_spot_votes
  ADD COLUMN IF NOT EXISTS week_start date,
  ADD COLUMN IF NOT EXISTS callsign text,
  ADD COLUMN IF NOT EXISTS voted_at timestamptz DEFAULT now();

UPDATE public.live_qso_spot_votes
   SET week_start = COALESCE(
         week_start,
         (date_trunc('week', created_at AT TIME ZONE 'UTC' + interval '1 day')::date - 1)
       ),
       callsign = COALESCE(callsign, voter_callsign),
       voted_at = COALESCE(voted_at, created_at, now())
 WHERE week_start IS NULL OR callsign IS NULL OR voted_at IS NULL;

ALTER TABLE public.live_qso_spot_votes
  ALTER COLUMN week_start SET NOT NULL,
  ALTER COLUMN callsign SET NOT NULL,
  ALTER COLUMN voted_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS live_qso_spot_votes_week_spot_callsign_uidx
  ON public.live_qso_spot_votes (week_start, spot_key, callsign);

CREATE OR REPLACE FUNCTION public._ensure_live_qso_spot_contest_started()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_started_at timestamptz;
BEGIN
  SELECT contest_started_at INTO v_started_at
    FROM public.live_qso_spot_contest_settings
   WHERE singleton = true FOR UPDATE;

  IF v_started_at IS NULL THEN
    UPDATE public.live_qso_spot_contest_settings
       SET contest_started_at = now(), required_users = 0, updated_at = now()
     WHERE singleton = true
     RETURNING contest_started_at INTO v_started_at;
  END IF;
  RETURN v_started_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_live_qso_spot(
  p_callsign text, p_token uuid, p_spot_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_callsign text := upper(btrim(coalesce(p_callsign, '')));
  v_week_start date := (date_trunc('week', timezone('UTC', now()) + interval '1 day')::date - 1);
  v_inserted integer;
  v_votes integer;
BEGIN
  IF v_callsign = '' OR p_token IS NULL OR coalesce(p_spot_key, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- Validación contra el registro compartido canónico.
  IF NOT EXISTS (
    SELECT 1 FROM public.community_call_signs c
    WHERE upper(btrim(c.callsign)) = v_callsign
      AND c.identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'identity_not_verified');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.live_qso_spots s WHERE s.spot_key = p_spot_key) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'spot_not_found');
  END IF;

  PERFORM public._ensure_live_qso_spot_contest_started();

  INSERT INTO public.live_qso_spot_votes (week_start, spot_key, callsign, voted_at)
  VALUES (v_week_start, p_spot_key, v_callsign, now())
  ON CONFLICT (week_start, spot_key, callsign) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_voted');
  END IF;

  SELECT count(*)::integer INTO v_votes
    FROM public.live_qso_spot_votes
   WHERE week_start = v_week_start AND spot_key = p_spot_key;

  RETURN jsonb_build_object('ok', true, 'spot_key', p_spot_key, 'votes', v_votes, 'week_start', v_week_start);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_live_spot_votes(p_callsign text, p_token uuid)
RETURNS TABLE (spot_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_callsign text := upper(btrim(coalesce(p_callsign, '')));
  v_week_start date := (date_trunc('week', timezone('UTC', now()) + interval '1 day')::date - 1);
BEGIN
  IF v_callsign = '' OR p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community_call_signs c
    WHERE upper(btrim(c.callsign)) = v_callsign AND c.identity_token = p_token
  ) THEN RETURN; END IF;

  RETURN QUERY SELECT v.spot_key
    FROM public.live_qso_spot_votes v
   WHERE v.week_start = v_week_start AND v.callsign = v_callsign;
END;
$$;

-- Cierre semanal idempotente: ganador con más votos, publicación y purga del feed.
-- Los votos se guardan como historial; solo se borran los spots activos.
CREATE OR REPLACE FUNCTION public.finalize_previous_live_spot_week()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_week date := (date_trunc('week', timezone('UTC', now()) + interval '1 day')::date - 1);
  v_previous_week date := (date_trunc('week', timezone('UTC', now()) + interval '1 day')::date - 8);
  v_inserted integer := 0;
  v_deleted integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('logbook_live_qso_spot_weekly_cleanup'));

  IF EXISTS (
    SELECT 1 FROM public.live_qso_spot_weekly_cleanup WHERE week_start = v_current_week
  ) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_finalized');
  END IF;

  INSERT INTO public.live_qso_spot_weekly_winners (
    week_start, spot_key, callsign, station_callsign, qso_date, qso_time,
    band, frequency, mode, country, votes
  )
  SELECT v.week_start, s.spot_key, s.callsign, s.station_callsign, s.qso_date,
         s.qso_time, s.band, s.frequency, s.mode, s.country, count(*)::integer
    FROM public.live_qso_spot_votes v
    JOIN public.live_qso_spots s ON s.spot_key = v.spot_key
   WHERE v.week_start = v_previous_week
   GROUP BY v.week_start, s.spot_key, s.callsign, s.station_callsign,
            s.qso_date, s.qso_time, s.band, s.frequency, s.mode, s.country
   ORDER BY count(*) DESC, min(v.voted_at) ASC, s.spot_key ASC
   LIMIT 1
  ON CONFLICT (week_start) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  DELETE FROM public.live_qso_spots;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.live_qso_spot_weekly_cleanup (week_start, cleaned_at)
  VALUES (v_current_week, now())
  ON CONFLICT (week_start) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'week_start', v_previous_week,
    'winner_published', v_inserted > 0, 'spots_deleted', v_deleted);
END;
$$;

-- Reprogramar la tarea del servidor para domingo 00:00 UTC.
DO $cron$
DECLARE v_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_jobid IN
      SELECT jobid FROM cron.job
       WHERE jobname IN ('logbook-weekly-spot-cleanup', 'finalize-live-spot-weekly-winner')
    LOOP
      PERFORM cron.unschedule(v_jobid);
    END LOOP;

    PERFORM cron.schedule(
      'logbook-weekly-spot-cleanup',
      '0 0 * * 0',
      'SELECT public.finalize_previous_live_spot_week();'
    );
  ELSE
    RAISE NOTICE 'pg_cron no está instalado: activar pg_cron para que la limpieza y el premio se ejecuten puntualmente los domingos 00:00 UTC.';
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    RAISE NOTICE 'No se pudo programar pg_cron. Instalar/autorizar pg_cron en Supabase.';
END;
$cron$;

REVOKE ALL ON FUNCTION public._ensure_live_qso_spot_contest_started() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vote_live_qso_spot(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_live_spot_votes(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_previous_live_spot_week() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_live_qso_spot(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_live_spot_votes(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_previous_live_spot_week() TO anon, authenticated;
