-- LogBook eQSL EXPRESS — DX DE LA SEMANA
-- Safe additive migration. Does not delete or modify existing spots, chat messages, or eQSL data.
-- Voting rule: one vote per registered identity per spot per UTC week.
-- Contest voting activates when community_call_signs reaches 100 registered identities.

CREATE TABLE IF NOT EXISTS public.live_qso_spot_votes (
  week_start date NOT NULL,
  spot_key text NOT NULL,
  callsign text NOT NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_qso_spot_votes_pkey PRIMARY KEY (week_start, spot_key, callsign)
);

CREATE INDEX IF NOT EXISTS live_qso_spot_votes_week_spot_idx
  ON public.live_qso_spot_votes (week_start, spot_key);

CREATE TABLE IF NOT EXISTS public.live_qso_spot_weekly_winners (
  week_start date PRIMARY KEY,
  spot_key text NOT NULL,
  callsign text NOT NULL,
  station_callsign text NOT NULL,
  qso_date date NOT NULL,
  qso_time time without time zone NOT NULL,
  band text NOT NULL,
  frequency text NOT NULL,
  mode text NOT NULL DEFAULT '',
  country text,
  votes integer NOT NULL CHECK (votes > 0),
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.live_qso_spot_contest_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  contest_started_at timestamptz NOT NULL DEFAULT now(),
  required_users integer NOT NULL DEFAULT 1 CHECK (required_users > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.live_qso_spot_contest_settings (singleton, contest_started_at, required_users)
VALUES (true, now(), 1)
ON CONFLICT (singleton) DO UPDATE
SET contest_started_at = COALESCE(public.live_qso_spot_contest_settings.contest_started_at, now()),
    required_users = 1,
    updated_at = now();

ALTER TABLE public.live_qso_spot_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_qso_spot_weekly_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_qso_spot_contest_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read weekly DX winners" ON public.live_qso_spot_weekly_winners;
CREATE POLICY "Public can read weekly DX winners"
  ON public.live_qso_spot_weekly_winners
  FOR SELECT TO anon, authenticated
  USING (true);

-- Votes and contest settings are accessed only through SECURITY DEFINER RPCs.
REVOKE ALL ON public.live_qso_spot_votes FROM anon, authenticated;
REVOKE ALL ON public.live_qso_spot_contest_settings FROM anon, authenticated;
GRANT SELECT ON public.live_qso_spot_weekly_winners TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._ensure_live_qso_spot_contest_started()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_started_at timestamptz;
  v_required integer;
  v_users bigint;
BEGIN
  SELECT contest_started_at, required_users
    INTO v_started_at, v_required
  FROM public.live_qso_spot_contest_settings
  WHERE singleton = true
  FOR UPDATE;

  IF v_started_at IS NOT NULL THEN
    RETURN v_started_at;
  END IF;

  SELECT count(*) INTO v_users
  FROM public.community_call_signs;

  -- DX semanal comienza inmediatamente; no depende de alcanzar 100 usuarios.
  UPDATE public.live_qso_spot_contest_settings
     SET contest_started_at = now(), required_users = 1, updated_at = now()
   WHERE singleton = true
   RETURNING contest_started_at INTO v_started_at;

  RETURN v_started_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_live_qso_spot(
  p_callsign text,
  p_token uuid,
  p_spot_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_callsign text := upper(btrim(coalesce(p_callsign, '')));
  v_started_at timestamptz;
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
    SELECT 1 FROM public.live_qso_spots s
    WHERE s.spot_key = p_spot_key
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'spot_not_found');
  END IF;

  v_started_at := public._ensure_live_qso_spot_contest_started();
  IF v_started_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'contest_not_started'
    );
  END IF;

  INSERT INTO public.live_qso_spot_votes (week_start, spot_key, callsign)
  VALUES (v_week_start, p_spot_key, v_callsign)
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

CREATE OR REPLACE FUNCTION public.get_my_live_spot_votes(
  p_callsign text,
  p_token uuid
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
  WHERE v.week_start = v_week_start
    AND v.callsign = v_callsign;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_previous_live_spot_week()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_started_at timestamptz;
  v_previous_week date := (date_trunc('week', timezone('UTC', now()))::date - 7);
  v_inserted integer;
BEGIN
  v_started_at := public._ensure_live_qso_spot_contest_started();
  IF v_started_at IS NULL OR v_previous_week < date_trunc('week', v_started_at AT TIME ZONE 'UTC')::date THEN
    RETURN jsonb_build_object('ok', true, 'status', 'contest_started');
  END IF;

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
  RETURN jsonb_build_object(
    'ok', true,
    'week_start', v_previous_week,
    'winner_published', v_inserted > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public._ensure_live_qso_spot_contest_started() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vote_live_qso_spot(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_live_spot_votes(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_previous_live_spot_week() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.vote_live_qso_spot(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_live_spot_votes(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_previous_live_spot_week() TO anon, authenticated;

-- Enable Realtime for winner announcements without failing if already published.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_qso_spot_weekly_winners'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.live_qso_spot_weekly_winners;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END;
$$;
