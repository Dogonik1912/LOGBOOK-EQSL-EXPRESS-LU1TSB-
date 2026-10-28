-- LogBook eQSL EXPRESS: secure spot administration and weekly cleanup.
-- Deletes only public.live_qso_spots. Votes and published winners remain intact.

CREATE TABLE IF NOT EXISTS public.live_qso_spot_weekly_cleanup (
  week_start date PRIMARY KEY,
  cleaned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_qso_spot_weekly_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_qso_spot_weekly_cleanup FROM PUBLIC, anon, authenticated;

-- Mark the installation week as already handled so applying this migration midweek
-- does not immediately delete the spots currently being collected.
INSERT INTO public.live_qso_spot_weekly_cleanup (week_start)
VALUES (date_trunc('week', timezone('UTC', now()))::date)
ON CONFLICT (week_start) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_delete_live_qso_spot(
  p_callsign text,
  p_token uuid,
  p_spot_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_callsign text := upper(btrim(coalesce(p_callsign, '')));
  v_deleted integer := 0;
BEGIN
  IF v_callsign = '' OR p_token IS NULL OR coalesce(p_spot_key, '') = '' THEN
    RAISE EXCEPTION 'Datos de autorización incompletos';
  END IF;

  IF public.community_actor_role(v_callsign, p_token) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permiso de administrador requerido';
  END IF;

  DELETE FROM public.live_qso_spots
  WHERE spot_key = p_spot_key;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_all_live_qso_spots(
  p_callsign text,
  p_token uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_callsign text := upper(btrim(coalesce(p_callsign, '')));
  v_deleted integer := 0;
BEGIN
  IF v_callsign = '' OR p_token IS NULL THEN
    RAISE EXCEPTION 'Datos de autorización incompletos';
  END IF;

  IF public.community_actor_role(v_callsign, p_token) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permiso de administrador requerido';
  END IF;

  DELETE FROM public.live_qso_spots;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_live_qso_spot(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_all_live_qso_spots(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_live_qso_spot(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_all_live_qso_spots(text, uuid) TO anon, authenticated;

-- Finalize the previous UTC week once, preserve the winner, then clear the spot feed.
-- An advisory lock makes concurrent app loads safe. The marker prevents repeated
-- calls during the same week from deleting spots posted after the weekly reset.
CREATE OR REPLACE FUNCTION public.finalize_previous_live_spot_week()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_started_at timestamptz;
  v_current_week date := date_trunc('week', timezone('UTC', now()))::date;
  v_previous_week date := date_trunc('week', timezone('UTC', now()))::date - 7;
  v_inserted integer := 0;
  v_deleted integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('logbook_live_qso_spot_weekly_cleanup'));

  IF EXISTS (
    SELECT 1 FROM public.live_qso_spot_weekly_cleanup
    WHERE week_start = v_current_week
  ) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_finalized');
  END IF;

  v_started_at := public._ensure_live_qso_spot_contest_started();

  IF v_started_at IS NOT NULL
     AND v_previous_week >= date_trunc('week', v_started_at AT TIME ZONE 'UTC')::date THEN
    INSERT INTO public.live_qso_spot_weekly_winners (
      week_start, spot_key, callsign, station_callsign, qso_date, qso_time,
      band, frequency, mode, country, votes
    )
    SELECT
      v.week_start, s.spot_key, s.callsign, s.station_callsign, s.qso_date,
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
  END IF;

  DELETE FROM public.live_qso_spots;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.live_qso_spot_weekly_cleanup (week_start, cleaned_at)
  VALUES (v_current_week, now())
  ON CONFLICT (week_start) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'week_start', v_previous_week,
    'winner_published', v_inserted > 0,
    'spots_deleted', v_deleted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_previous_live_spot_week() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_previous_live_spot_week() TO anon, authenticated;
