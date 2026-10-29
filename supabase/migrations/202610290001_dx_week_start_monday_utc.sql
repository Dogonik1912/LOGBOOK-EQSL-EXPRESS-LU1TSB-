-- LogBook eQSL EXPRESS: unificar el calendario de votos con semanas UTC ISO (lunes a lunes).
-- No elimina ni reescribe votos ya guardados, ganadores ni spots.
-- Los votos nuevos, la consulta de votos y el cierre usan el mismo lunes UTC.

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
  v_week_start date := date_trunc('week', timezone('UTC', now()))::date;
  v_inserted integer;
  v_votes integer;
BEGIN
  IF v_callsign = '' OR p_token IS NULL OR coalesce(p_spot_key, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_call_signs c
    WHERE upper(btrim(c.callsign)) = v_callsign
      AND c.identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'identity_not_verified');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_qso_spots s WHERE s.spot_key = p_spot_key
  ) THEN
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

  RETURN jsonb_build_object(
    'ok', true, 'spot_key', p_spot_key, 'votes', v_votes, 'week_start', v_week_start
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_live_spot_votes(
  p_callsign text, p_token uuid
)
RETURNS TABLE (spot_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_callsign text := upper(btrim(coalesce(p_callsign, '')));
  v_week_start date := date_trunc('week', timezone('UTC', now()))::date;
BEGIN
  IF v_callsign = '' OR p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community_call_signs c
    WHERE upper(btrim(c.callsign)) = v_callsign
      AND c.identity_token = p_token
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v.spot_key
  FROM public.live_qso_spot_votes v
  WHERE v.week_start = v_week_start AND v.callsign = v_callsign;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_previous_live_spot_week()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

  RETURN jsonb_build_object(
    'ok', true,
    'week_start', v_previous_week,
    'winner_published', v_inserted > 0,
    'spots_deleted', v_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vote_live_qso_spot(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_live_spot_votes(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_previous_live_spot_week() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_live_qso_spot(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_live_spot_votes(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_previous_live_spot_week() TO anon, authenticated;
