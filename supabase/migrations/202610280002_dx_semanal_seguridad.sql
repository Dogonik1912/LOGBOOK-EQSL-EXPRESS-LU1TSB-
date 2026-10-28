-- LogBook eQSL EXPRESS: reparación segura de DX SEMANAL.
-- No elimina ni modifica spots existentes.
-- Los usuarios comunes pueden leer/insertar spots, pero no actualizarlos ni borrarlos.

CREATE TABLE IF NOT EXISTS public.live_qso_spot_votes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spot_key text NOT NULL,
  voter_token uuid NOT NULL,
  voter_callsign text NOT NULL,
  callsign text NOT NULL,
  station_callsign text NOT NULL,
  qso_date date NOT NULL,
  qso_time time NOT NULL,
  band text NOT NULL,
  frequency text NOT NULL,
  mode text NOT NULL DEFAULT '',
  country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_qso_spot_votes_once_per_identity UNIQUE (spot_key, voter_token)
);
CREATE INDEX IF NOT EXISTS live_qso_spot_votes_created_at_idx
  ON public.live_qso_spot_votes (created_at DESC, spot_key);
ALTER TABLE public.live_qso_spot_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_qso_spot_votes FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.live_qso_spot_weekly_winners (
  week_start date PRIMARY KEY,
  spot_key text NOT NULL,
  callsign text NOT NULL,
  station_callsign text NOT NULL,
  qso_date date NOT NULL,
  qso_time time NOT NULL,
  band text NOT NULL,
  frequency text NOT NULL,
  mode text NOT NULL DEFAULT '',
  country text,
  votes integer NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_qso_spot_weekly_winners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read weekly live spot winners" ON public.live_qso_spot_weekly_winners;
CREATE POLICY "Public can read weekly live spot winners"
  ON public.live_qso_spot_weekly_winners FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON TABLE public.live_qso_spot_weekly_winners FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.live_qso_spot_weekly_winners TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.live_qso_spot_weekly_cleanup (
  week_start date PRIMARY KEY,
  cleaned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_qso_spot_weekly_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_qso_spot_weekly_cleanup FROM PUBLIC, anon, authenticated;

-- Protección explícita contra modificaciones directas de spots por usuarios comunes.
ALTER TABLE public.live_qso_spots ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.live_qso_spots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.live_qso_spots TO anon, authenticated;
DROP POLICY IF EXISTS "Public can read live QSO spots" ON public.live_qso_spots;
CREATE POLICY "Public can read live QSO spots"
  ON public.live_qso_spots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public can add live QSO spots" ON public.live_qso_spots;
CREATE POLICY "Public can add live QSO spots"
  ON public.live_qso_spots FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.vote_live_qso_spot(
  p_callsign text, p_token uuid, p_spot_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  voter text := upper(trim(coalesce(p_callsign, '')));
  spot public.live_qso_spots%rowtype;
  inserted_id bigint;
BEGIN
  IF p_token IS NULL OR char_length(voter) NOT BETWEEN 3 AND 24
     OR voter !~ '^[A-Z0-9/.-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_identity');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_call_signs c
     WHERE upper(trim(c.callsign)) = voter AND c.identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'identity_not_verified');
  END IF;
  SELECT * INTO spot FROM public.live_qso_spots WHERE spot_key = p_spot_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'spot_not_found');
  END IF;
  INSERT INTO public.live_qso_spot_votes (
    spot_key, voter_token, voter_callsign, callsign, station_callsign,
    qso_date, qso_time, band, frequency, mode, country
  ) VALUES (
    spot.spot_key, p_token, voter, spot.callsign, spot.station_callsign,
    spot.qso_date, spot.qso_time, spot.band, spot.frequency, spot.mode, spot.country
  )
  ON CONFLICT (spot_key, voter_token) DO NOTHING
  RETURNING id INTO inserted_id;
  IF inserted_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_voted');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_live_spot_votes(p_callsign text, p_token uuid)
RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.spot_key
  FROM public.live_qso_spot_votes v
  WHERE p_token IS NOT NULL
    AND v.voter_token = p_token
    AND v.voter_callsign = upper(trim(coalesce(p_callsign, '')))
    AND EXISTS (
      SELECT 1 FROM public.community_call_signs c
      WHERE upper(trim(c.callsign)) = upper(trim(coalesce(p_callsign, '')))
        AND c.identity_token = p_token
    );
$$;

-- Finaliza la semana anterior sin borrar spots. Repetible y segura.
CREATE OR REPLACE FUNCTION public.finalize_previous_live_spot_week()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_week date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
  completed_week date := date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7;
  winner_row record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('logbook_live_qso_spot_weekly_finalize'));
  IF EXISTS (
    SELECT 1 FROM public.live_qso_spot_weekly_cleanup WHERE week_start = current_week
  ) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_finalized', 'spots_deleted', 0);
  END IF;
  SELECT v.spot_key, v.callsign, v.station_callsign, v.qso_date, v.qso_time,
         v.band, v.frequency, v.mode, v.country, count(*)::integer AS votes
    INTO winner_row
    FROM public.live_qso_spot_votes v
   WHERE (v.created_at AT TIME ZONE 'UTC') >= completed_week::timestamp
     AND (v.created_at AT TIME ZONE 'UTC') < current_week::timestamp
   GROUP BY v.spot_key, v.callsign, v.station_callsign, v.qso_date, v.qso_time,
            v.band, v.frequency, v.mode, v.country
   ORDER BY count(*) DESC, min(v.created_at) ASC, v.spot_key ASC
   LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.live_qso_spot_weekly_winners (
      week_start, spot_key, callsign, station_callsign, qso_date, qso_time,
      band, frequency, mode, country, votes
    ) VALUES (
      completed_week, winner_row.spot_key, winner_row.callsign, winner_row.station_callsign,
      winner_row.qso_date, winner_row.qso_time, winner_row.band, winner_row.frequency,
      winner_row.mode, winner_row.country, winner_row.votes
    ) ON CONFLICT (week_start) DO NOTHING;
  END IF;
  INSERT INTO public.live_qso_spot_weekly_cleanup (week_start, cleaned_at)
  VALUES (current_week, now()) ON CONFLICT (week_start) DO NOTHING;
  RETURN jsonb_build_object(
    'ok', true, 'week_start', completed_week,
    'winner_published', EXISTS (
      SELECT 1 FROM public.live_qso_spot_weekly_winners WHERE week_start = completed_week
    ),
    'spots_deleted', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vote_live_qso_spot(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_live_spot_votes(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_previous_live_spot_week() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_live_qso_spot(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_live_spot_votes(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_previous_live_spot_week() TO anon, authenticated;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finalize-live-spot-weekly-winner') THEN
      PERFORM cron.schedule('finalize-live-spot-weekly-winner', '5 0 * * 1',
        'select public.finalize_previous_live_spot_week();');
    END IF;
  END IF;
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
  RAISE NOTICE 'pg_cron no disponible; usar llamada de respaldo desde la aplicación.';
END
$schedule$;
